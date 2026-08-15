// Exporta las transacciones visibles a un archivo Excel con resumen y grafica
export async function exportTransactionsToExcel({
  transactions,
  selectedMonth,
  selectedMonthLabel,
  summary,
  chartCanvasId
}) {
  if (!Array.isArray(transactions) || transactions.length === 0) return;

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

  createTransactionsSheet(workbook, transactions);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `transacciones-${selectedMonth || 'mes'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
function createTransactionsSheet(workbook, transactions) {
  const worksheet = workbook.addWorksheet('Transacciones');

  worksheet.columns = [
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Categoria', key: 'category', width: 28 },
    { header: 'Banco', key: 'bank', width: 20 },
    { header: 'Origen', key: 'source', width: 24 },
    { header: 'Destino', key: 'destinationSource', width: 24 },
    { header: 'Descripcion', key: 'description', width: 32 },
    { header: 'Monto', key: 'amount', width: 18 },
    { header: 'Fecha', key: 'date', width: 24 }
  ];

  transactions.forEach(transaction => {
    worksheet.addRow({
      type: transaction.type === 'income' ? 'Ingreso' : transaction.type === 'expense' ? 'Gasto' : 'Retiro Bancario',
      category: transaction.category,
      bank: transaction.bank || '-',
      source: formatTransactionSource(transaction.source),
      destinationSource: transaction.destinationSource ? formatTransactionSource(transaction.destinationSource) : '-',
      description: transaction.description || '-',
      amount: transaction.amount,
      date: transaction.date instanceof Date ? transaction.date : ''
    });
  });

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF004E8F' }
  };

  worksheet.getColumn('amount').numFmt = '"$"#,##0';
  worksheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const typeCell = row.getCell('type');
    const amountCell = row.getCell('amount');
    const isIncome = typeCell.value === 'Ingreso';
    const isTransfer = typeCell.value === 'Retiro Bancario';

    typeCell.font = { bold: true, color: { argb: isIncome ? 'FF198754' : isTransfer ? 'FF0D6EFD' : 'FFDC3545' } };
    amountCell.font = { bold: true, color: { argb: isIncome ? 'FF198754' : isTransfer ? 'FF0D6EFD' : 'FFDC3545' } };
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

function formatTransactionSource(source) {
  const sourceLabels = {
    wallet: 'Efectivo',
    savings: 'Cuenta de Ahorros'
  };

  return sourceLabels[source] || sourceLabels.wallet;
}
