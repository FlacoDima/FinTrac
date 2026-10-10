// Exporta las transacciones visibles a un archivo Excel con resumen y grafica
export async function exportTransactionsToExcel({
  transactions,
  selectedMonth,
  selectedMonthLabel,
  summary,
  chartCanvasId,
  formatters
}) {
  if (!Array.isArray(transactions) || transactions.length === 0) return;

  const safeFormatters = getSafeFormatters(formatters);
  const { default: ExcelJS } = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Fintrac';
  workbook.created = new Date();
  workbook.modified = new Date();

  createSummarySheet(workbook, {
    selectedMonthLabel,
    summary,
    chartCanvasId
  });

  createTransactionsSheet(workbook, transactions, safeFormatters);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = buildExportFileName(selectedMonth, selectedMonthLabel);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildExportFileName(selectedMonth, selectedMonthLabel) {
  const safeLabel = sanitizeFileName(selectedMonthLabel || resolveDefaultMonthLabel(selectedMonth));
  return `transacciones - ${safeLabel}.xlsx`;
}

function sanitizeFileName(rawName) {
  return String(rawName || 'mes')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDefaultMonthLabel(selectedMonth) {
  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric'
    }).replace(/^\w/, char => char.toUpperCase());
  }

  const today = new Date();
  return today.toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric'
  }).replace(/^\w/, char => char.toUpperCase());
}

function getSafeFormatters(formatters) {
  const defaultFormatters = {
    getTypeLabel: (transactionType) =>
      transactionType === 'income' ? 'Ingreso'
        : transactionType === 'expense' ? 'Gasto'
        : 'Retiro Bancario',
    getCategoryLabel: (transaction) =>
      transaction?.type === 'transfer' ? '-' : (transaction?.category || '-'),
    getMovementText: (transaction) => {
      const sourceLabels = { wallet: 'Efectivo', savings: 'Cuenta de Ahorros' };
      const src = sourceLabels[transaction?.source] || 'Efectivo';
      if (transaction?.type === 'transfer' && transaction?.destinationSource) {
        const dst = sourceLabels[transaction.destinationSource] || 'Efectivo';
        return `${src} → ${dst}`;
      }
      return src;
    },
    getBankLabel: (transaction) =>
      transaction?.type === 'transfer' ? (transaction?.bank || '-') : '-',
    getAmountValue: (transaction) =>
      transaction?.type === 'expense' ? -Math.abs(transaction?.amount || 0) : (transaction?.amount || 0)
  };

  return { ...defaultFormatters, ...(formatters || {}) };
}

// Crea la hoja resumen del mes exportado
function createSummarySheet(workbook, { selectedMonthLabel, summary, chartCanvasId }) {
  const worksheet = workbook.addWorksheet('Resumen');
  const chartImage = getChartImage(chartCanvasId);

  worksheet.columns = [
    { width: 24 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 }
  ];

  worksheet.mergeCells('A1:E1');
  worksheet.getCell('A1').value = 'Reporte Mensual Fintrac';
  worksheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF004E8F' } };

  worksheet.getCell('A3').value = 'Mes exportado';
  worksheet.getCell('B3').value = selectedMonthLabel;
  worksheet.getCell('A4').value = 'Saldo total';
  worksheet.getCell('B4').value = summary.totalBalance;
  worksheet.getCell('A5').value = 'Ingresos del mes';
  worksheet.getCell('B5').value = summary.totalIncome;
  worksheet.getCell('A6').value = 'Gastos del mes';
  worksheet.getCell('B6').value = summary.totalExpenses;
  worksheet.getCell('A8').value = 'Efectivo';
  worksheet.getCell('B8').value = summary.sourceBalances?.wallet ?? 0;
  worksheet.getCell('A9').value = 'Cuenta de ahorros';
  worksheet.getCell('B9').value = summary.sourceBalances?.savings ?? 0;

  ['A3', 'A4', 'A5', 'A6', 'A8', 'A9'].forEach(cell => {
    worksheet.getCell(cell).font = { bold: true };
    worksheet.getCell(cell).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F6FB' }
    };
  });

  ['B4', 'B5', 'B6', 'B8', 'B9'].forEach(cell => {
    worksheet.getCell(cell).numFmt = '"$"#,##0';
    worksheet.getCell(cell).font = { bold: true };
  });

  worksheet.getCell('B4').font = { bold: true, color: { argb: 'FF2166F3' } };
  worksheet.getCell('B5').font = { bold: true, color: { argb: 'FF198754' } };
  worksheet.getCell('B6').font = { bold: true, color: { argb: 'FFDC3545' } };

  if (chartImage) {
    const imageId = workbook.addImage({
      base64: chartImage,
      extension: 'png'
    });

    worksheet.addImage(imageId, {
      tl: { col: 3.2, row: 1.2 },
      ext: { width: 520, height: 320 }
    });
  }
}

// Crea la hoja con el detalle de transacciones del mes exportado
function createTransactionsSheet(workbook, transactions, formatters) {
  const worksheet = workbook.addWorksheet('Transacciones');

  worksheet.columns = [
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Categoria', key: 'category', width: 28 },
    { header: 'Cuenta Bancaria', key: 'bank', width: 20 },
    { header: 'Movimiento', key: 'movement', width: 32 },
    { header: 'Descripcion', key: 'description', width: 32 },
    { header: 'Monto', key: 'amount', width: 18 },
    { header: 'Fecha', key: 'date', width: 24 }
  ];

  transactions.forEach(transaction => {
    const rawType = transaction?.type || 'income';
    worksheet.addRow({
      type: formatters.getTypeLabel(rawType, transaction),
      category: formatters.getCategoryLabel(transaction),
      bank: formatters.getBankLabel(transaction),
      movement: formatters.getMovementText(transaction),
      description: transaction.description || '-',
      amount: formatters.getAmountValue(transaction),
      date: transaction.date instanceof Date ? transaction.date : ''
    });
  });

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF004E8F' }
  };

  worksheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const typeCell = row.getCell('type');
    const amountCell = row.getCell('amount');
    const bankCell = row.getCell('bank');
    const amountValue = Number(amountCell.value) || 0;
    const typeValue = String(typeCell.value || '');
    const isIncome = typeValue === 'Ingreso';
    const isTransfer = typeValue === 'Retiro Bancario';

    typeCell.font = {
      bold: true,
      color: { argb: isIncome ? 'FF198754' : isTransfer ? 'FF0D6EFD' : 'FFDC3545' }
    };

    if (isTransfer) {
      amountCell.numFmt = '\↔ "$"#,##0';
      amountCell.font = { bold: true, color: { argb: 'FF0D6EFD' } };
    } else if (amountValue > 0) {
      amountCell.numFmt = '\+ "$"#,##0;\- "$"#,##0';
      amountCell.font = { bold: true, color: { argb: 'FF198754' } };
    } else if (amountValue < 0) {
      amountCell.numFmt = '\+ "$"#,##0;\- "$"#,##0';
      amountCell.font = { bold: true, color: { argb: 'FFDC3545' } };
    } else {
      amountCell.numFmt = '"$"#,##0';
      amountCell.font = { bold: true };
    }

    if (isTransfer && bankCell.value && bankCell.value !== '-') {
      bankCell.font = { bold: true, color: { argb: 'FF0D6EFD' } };
    }
  });
}

// Obtiene la imagen actual de la grafica para insertarla en el Excel
function getChartImage(chartCanvasId) {
  const canvas = document.getElementById(chartCanvasId);

  if (!canvas || typeof canvas.toDataURL !== 'function') {
    return null;
  }

  return canvas.toDataURL('image/png', 1);
}
