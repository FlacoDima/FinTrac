// Importar Firebase
import { auth, db, doc, updateDoc } from './firebase-config.js';
import { exportTransactionsToExcel } from './export.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  Timestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Variables globales
let currentUser = null;
let expenseChart = null;
let editModal = null;
let deleteModal = null;
let currentTransactions = [];
let visibleTransactions = [];
let currentSearchTerm = '';
let currentSummary = {
  totalIncome: 0,
  totalExpenses: 0,
  totalBalance: 0,
  sourceBalances: {
    wallet: 0,
    savings: 0
  }
};
let transactionToDeleteId = null;
const DEFAULT_TRANSACTION_SOURCE = 'wallet';
const DEFAULT_TRANSFER_CATEGORY = 'Retiro de cuenta bancaria';

const TRANSACTION_SOURCES = {
  wallet: {
    label: 'Efectivo',
    icon: 'fa-wallet'
  },
  savings: {
    label: 'Cuenta de Ahorros',
    icon: 'fa-piggy-bank'
  }
};

const VALID_TRANSACTION_TYPES = ['income', 'expense', 'transfer'];

const BANK_OPTIONS = [
  "Bancolombia",
  "Banco de Bogotá",
  "Banco Davivienda",
  "BBVA Colombia",
  "Scotiabank Colpatria",
  "Banco de Occidente",
  "Banco Popular",
  "Banco Falabella",
  "Banco Itaú",
  "Banco Agrario",
  "Daviplata",
  "Nequi",
  "Movii",
  "Tpaga",
  "Efecty",
  "Banco Caja Social",
  "Bancoomeva",
  "Bancamía",
  "Finandina",
  "Otro"
];

// Definir categorías por tipo
// Estructura jerárquica con categorías principales y subcategorías
const CATEGORIES = {
  income: {
    "💼 Salario y Empleo Fijo": [
      "Sueldos y salarios",
      "Horas extras y recargos",
      "Primas, bonos y cesantías",
      "Comisiones por ventas"
    ],
    "🚀 Trabajo Independiente o Negocios": [
      "Honorarios profesionales",
      "Ventas de productos o servicios",
      "Ganancias de emprendimiento o negocio propio"
    ],
    "📈 Inversiones y Pasivos": [
      "Alquiler o renta de bienes (casas, locales, vehículos)",
      "Dividendos de acciones",
      "Intereses de cuentas de ahorro o CDT",
      "Regalías"
    ],
    "🎁 Otros Ingresos y Apoyos": [
      "Pensiones o subsidios del gobierno",
      "Remesas o dinero de familiares",
      "Regalos, premios o loterías (ingresos ocasionales)",
      "Venta de artículos usados o activos que ya no usas"
    ]
  },
  expense: {
    "🏠 Vivienda y Servicios": [
      "Vivienda (Alquiler / Cuota Crédito)",
      "Servicios Públicos (Luz, Agua, Gas, Internet)",
      "Hogar (Mantenimiento, Aseo, Reparaciones)"
    ],
    "🍔 Estilo de Vida y Consumo": [
      "Alimentación (Mercado y Supermercado)",
      "Comidas fuera (Restaurantes y Apps)",
      "Ocio, Salidas y Suscripciones",
      "Compras (Ropa, Cuidado personal, Varios)"
    ],
    "🚗 Transporte y Movilidad": [
      "Transporte (Público, Gasolina, Peajes)",
      "Vehículo (Mantenimiento, Seguro, Impuestos)"
    ],
    "💳 Obligaciones y Finanzas": [
      "Deudas y Tarjetas de Crédito",
      "Salud (Médicos, Farmacia, Seguros)",
      "Educación y Crecimiento"
    ],
    "📦 Otros Gastos": [
      "Otros Gastos"
    ]
  }
};

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Verificar estado de autenticación
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      initDashboard(); // Inicializar dashboard cuando el usuario está autenticado
    }
  });
});

// Función para inicializar el dashboard
function initDashboard() {
  const transactionForm = document.getElementById('transactionForm');
  const transactionTypeInputs = document.querySelectorAll('input[name="transactionType"]');
  const editTransactionTypeInputs = document.querySelectorAll('input[name="editTransactionType"]');
  const saveEditBtn = document.getElementById('saveEditBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const monthSelector = document.getElementById('monthSelector');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const transactionSearchInput = document.getElementById('transactionSearchInput');

  // Inicializar modal de edición
  const editModalElement = document.getElementById('editTransactionModal');
  if (editModalElement && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    editModal = new bootstrap.Modal(editModalElement);
  }

  // Inicializar modal de eliminar (1 sola instancia de Bootstrap; NO tocar el DOM manualmente)
  let deleteModalBackdropObserver = null;
  const deleteModalElement = document.getElementById('deleteTransactionModal');
  if (deleteModalElement && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    deleteModal = new bootstrap.Modal(deleteModalElement, {
      backdrop: 'static',
      keyboard: false,
      focus: true
    });

    // Forzamos z-index y visibility en cada ciclo de apertura
    deleteModalElement.addEventListener('show.bs.modal', () => {
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      if (confirmBtn) confirmBtn.disabled = false;
      forceDeleteModalAboveBackdrop(deleteModalElement);
    });

    deleteModalElement.addEventListener('shown.bs.modal', () => {
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      if (confirmBtn) confirmBtn.disabled = false;
      forceDeleteModalAboveBackdrop(deleteModalElement);
    });

    deleteModalElement.addEventListener('hidden.bs.modal', () => {
      transactionToDeleteId = null;
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      if (confirmBtn) {
        confirmBtn.disabled = false;
      }
      if (deleteModalBackdropObserver) {
        try {
          deleteModalBackdropObserver.disconnect();
        } catch (error) {
          /* noop */
        }
        deleteModalBackdropObserver = null;
      }
      cleanupOrphanBackdrops();
    });
  }

  // Listeners para cerrar el modal manualmente (quitamos data-bs-dismiss del HTML para evitar doble vía)
  const cancelDeleteBtn = document.getElementById('cancelDeleteModalBtn');
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => closeDeleteModal());
  }
  const closeDeleteBtn = document.getElementById('closeDeleteModalBtn');
  if (closeDeleteBtn) {
    closeDeleteBtn.addEventListener('click', () => closeDeleteModal());
  }

  // MutationObserver global: cuando aparezca un .modal-backdrop, nos aseguramos que el modal esté por encima
  // (Plan B si Bootstrap por alguna razón no sincroniza)
  if (typeof MutationObserver !== 'undefined') {
    deleteModalBackdropObserver = new MutationObserver(mutations => {
      const deleteEl = document.getElementById('deleteTransactionModal');
      if (!deleteEl) return;
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node && node.nodeType === 1 && node.classList && node.classList.contains('modal-backdrop')) {
              forceDeleteModalAboveBackdrop(deleteEl);
              return;
            }
          }
        }
      }
    });

    deleteModalBackdropObserver.observe(document.body, {
      childList: true,
      subtree: false
    });
  }

  // Escuchar cambios en tipo de transacción para actualizar categorías
  transactionTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      syncTransactionFormFields('', input.value);
    });
  });

  // Escuchar cambios en tipo de transacción para modal de edición
  editTransactionTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      syncTransactionFormFields('edit', input.value);
    });
  });

  // Escuchar cambios en categoría para actualizar placeholder de descripción
  const categoryInput = document.getElementById('categoryInput');
  if (categoryInput) {
    categoryInput.addEventListener('change', () => {
      const selectedType = document.querySelector('input[name="transactionType"]:checked')?.value || 'income';
      updateDescriptionPlaceholderForCategory('', selectedType);
    });
  }

  const editCategoryInput = document.getElementById('editCategoryInput');
  if (editCategoryInput) {
    editCategoryInput.addEventListener('change', () => {
      const selectedType = document.querySelector('input[name="editTransactionType"]:checked')?.value || 'income';
      updateDescriptionPlaceholderForCategory('edit', selectedType);
    });
  }

  if (transactionSearchInput) {
    transactionSearchInput.addEventListener('input', () => {
      currentSearchTerm = transactionSearchInput.value.trim();
      applyTransactionFilters();
    });
  }

  // Delegación de eventos para botones de editar y eliminar en la tabla
  const transactionTableBody = document.getElementById('transactionTableBody');
  if (transactionTableBody) {
    transactionTableBody.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('.delete-transaction-btn');
      const editBtn = event.target.closest('.edit-transaction-btn');

      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        const transactionId = deleteBtn.getAttribute('data-id');
        if (transactionId) {
          openDeleteModal(transactionId);
        }
      }

      if (editBtn) {
        event.preventDefault();
        event.stopPropagation();
        const transactionId = editBtn.getAttribute('data-id');
        if (transactionId) {
          openEditModal(transactionId, currentTransactions);
        }
      }
    });
  }

  // Filtrar inputs de monto para permitir solo digitos (sin spinners nativos)
  setupAmountNumericInput('amountInput');
  setupAmountNumericInput('editAmountInput');

  // Escuchar envío del formulario de transacciones
  if (transactionForm) {
    transactionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await addTransaction();
    });
  }

  // Escuchar clic en botón de guardar edición
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
      await saveTransactionEdit();
    });
  }

  // Confirmar eliminación de transacción
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      await deleteTransaction();
    });
  }

  // Inicializar selector de mes persistido en localStorage
  if (monthSelector) {
    monthSelector.max = getCurrentMonthValue();
    const persistedMonth = getPersistedMonthValue();
    monthSelector.value = persistedMonth;
    updatePeriodTexts(monthSelector.value);
    monthSelector.addEventListener('change', async () => {
      monthSelector.value = normalizeMonthValue(monthSelector.value);
      persistMonthValue(monthSelector.value);
      updatePeriodTexts(monthSelector.value);
      await loadTransactions();
    });
  }

  // Exportar transacciones visibles a Excel
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', async () => {
      const selectedMonth = getSelectedMonthValue();
      const selectedMonthLabel = formatMonthLabel(selectedMonth);

      exportCsvBtn.disabled = true;

      try {
        await exportTransactionsToExcel({
          transactions: visibleTransactions,
          selectedMonth,
          selectedMonthLabel,
          summary: currentSummary,
          chartCanvasId: 'expenseChart',
          formatters: {
            getTypeLabel: getFormattedTransactionTypeLabel,
            getCategoryLabel: getTransactionCategoryLabel,
            getSourceLabel: getFormattedTransactionSourceLabel,
            getDestinationLabel: getFormattedTransactionDestinationLabel,
            getMovementText: getFormattedTransactionMovementText,
            getBankLabel: getFormattedBankLabel,
            getAmountValue: getFormattedAmountValueForExport
          }
        });
      } finally {
        updateExportButtonState(visibleTransactions);
      }
    });
  }

  // Cargar transacciones iniciales y setear categorías iniciales
  syncTransactionFormFields('', 'income');
  syncTransactionFormFields('edit', 'income');
  loadTransactions();
}

function isHierarchicalCategory(transactionType) {
  const normalized = normalizeTransactionType(transactionType);
  if (normalized === 'income' || normalized === 'expense') {
    return !Array.isArray(CATEGORIES[normalized]);
  }
  return false;
}

function mapLegacyExpenseCategory(oldCategory) {
  if (!oldCategory) return oldCategory;
  const legacyMap = {
    "Alquiler / Hipoteca": "Vivienda (Alquiler / Cuota Crédito)",
    "Servicios Públicos": "Servicios Básicos (Luz, Agua, Gas, Internet)",
    "Mercado / Despensa": "Alimentación (Mercado y Supermercado)",
    "Transporte Fijo": "Transporte (Público, Gasolina, Peajes)",
    "Comidas por fuera": "Comidas fuera (Restaurantes y Apps)",
    "Entretenimiento y Ocio": "Ocio, Salidas y Suscripciones",
    "Salud y Cuidado Personal": "Compras (Ropa, Cuidado personal, Varios)",
    "Ropa y Accesorios": "Compras (Ropa, Cuidado personal, Varios)",
    "Suscripciones y Software": "Ocio, Salidas y Suscripciones",
    "Educación y Proyectos": "Educación y Crecimiento",
    "Pago Tarjeta Crédito": "Deudas y Tarjetas de Crédito",
    "Otros Gastos": "Otros Gastos"
  };
  return legacyMap[oldCategory] || oldCategory;
}

function mapLegacyIncomeCategory(oldCategory) {
  if (!oldCategory) return oldCategory;
  const legacyMap = {
    "Salario": "Sueldos y salarios",
    "Trabajos Independientes": "Honorarios profesionales",
    "Inversiones": "Intereses de cuentas de ahorro o CDT",
    "Ventas": "Ventas de productos o servicios",
    "Otros Ingresos": "Regalos, premios o loterías (ingresos ocasionales)",
    "Trabajos Independientes / Freelance": "Honorarios profesionales",
    "Rendimientos / Inversiones": "Intereses de cuentas de ahorro o CDT",
    "Ventas / Otros Ingresos": "Ventas de productos o servicios"
  };
  return legacyMap[oldCategory] || oldCategory;
}

function mapLegacyCategory(transactionType, oldCategory) {
  const normalized = normalizeTransactionType(transactionType);
  if (normalized === 'income') return mapLegacyIncomeCategory(oldCategory);
  if (normalized === 'expense') return mapLegacyExpenseCategory(oldCategory);
  return oldCategory;
}

// Función para actualizar el dropdown de categorías según tipo de transacción
function updateCategoryDropdown(dropdownId, transactionType, selectedCategory) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;

  const normalizedType = normalizeTransactionType(transactionType);
  const valueToSelect = mapLegacyCategory(normalizedType, selectedCategory || dropdown.value);

  dropdown.innerHTML = '<option value="">Selecciona una categoría</option>';

  if (isHierarchicalCategory(normalizedType)) {
    const groups = CATEGORIES[normalizedType] || {};
    Object.keys(groups).forEach(groupName => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupName;
      const subcategories = groups[groupName] || [];
      subcategories.forEach(subcategory => {
        const option = document.createElement('option');
        option.value = subcategory;
        option.textContent = subcategory;
        if (subcategory === valueToSelect) option.selected = true;
        optgroup.appendChild(option);
      });
      dropdown.appendChild(optgroup);
    });
    return;
  }

  const categories = CATEGORIES[normalizedType] || [];
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    if (category === valueToSelect) option.selected = true;
    dropdown.appendChild(option);
  });
}

function updateBankDropdown(dropdownId, selectedBank) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  const current = selectedBank || dropdown.value;
  dropdown.innerHTML = '<option value="">Selecciona el banco</option>';
  BANK_OPTIONS.forEach(bank => {
    const option = document.createElement('option');
    option.value = bank;
    option.textContent = bank;
    if (bank === current) option.selected = true;
    dropdown.appendChild(option);
  });
}

function syncTransactionFormFields(prefix, transactionType) {
  const normalizedType = normalizeTransactionType(transactionType);
  const categoryInputId = prefix ? 'editCategoryInput' : 'categoryInput';
  const categoryWrapperId = prefix ? 'editCategoryFieldWrapper' : 'categoryFieldWrapper';
  const sourceInputId = prefix ? 'editSourceInput' : 'sourceInput';
  const sourceWrapperId = prefix ? 'editSourceFieldWrapper' : 'sourceFieldWrapper';
  const sourceLabelId = prefix ? 'editSourceInputLabel' : 'sourceInputLabel';
  const sourceHelpId = prefix ? 'editSourceInputHelp' : 'sourceInputHelp';
  const destinationInputId = prefix ? 'editDestinationInput' : 'destinationInput';
  const destinationWrapperId = prefix ? 'editDestinationFieldWrapper' : 'destinationFieldWrapper';
  const bankInputId = prefix ? 'editBankInput' : 'bankInput';
  const bankWrapperId = prefix ? 'editBankFieldWrapper' : 'bankFieldWrapper';
  const descriptionInputId = prefix ? 'editDescriptionInput' : 'descriptionInput';

  const categoryWrapper = document.getElementById(categoryWrapperId);
  const categoryInput = document.getElementById(categoryInputId);
  const sourceInput = document.getElementById(sourceInputId);
  const sourceWrapper = document.getElementById(sourceWrapperId);
  // const sourceLabel = document.getElementById(sourceLabelId);
  // const sourceHelp = document.getElementById(sourceHelpId);
  const destinationInput = document.getElementById(destinationInputId);
  const destinationWrapper = document.getElementById(destinationWrapperId);
  const bankInput = document.getElementById(bankInputId);
  const bankWrapper = document.getElementById(bankWrapperId);
  const descriptionInput = document.getElementById(descriptionInputId);

  if (!sourceInput || !destinationInput || !categoryInput || !bankInput) return;

  sourceInput.value = normalizeTransactionSource(sourceInput.value);
  destinationInput.value = normalizeTransactionSource(destinationInput.value || getAlternativeTransactionSource(sourceInput.value));
  destinationInput.setCustomValidity('');
  bankInput.setCustomValidity('');

  if (normalizedType === 'transfer') {
    categoryInput.value = DEFAULT_TRANSFER_CATEGORY;
    categoryInput.required = false;
    categoryWrapper?.classList.add('d-none');

    sourceWrapper?.classList.add('d-none');
    destinationWrapper?.classList.add('d-none');
    sourceInput.required = false;
    destinationInput.required = false;

    bankWrapper?.classList.remove('d-none');
    bankInput.required = true;
    updateBankDropdown(bankInputId, '');

    sourceInput.value = 'savings';
    destinationInput.value = 'wallet';

    if (descriptionInput) {
      descriptionInput.placeholder = 'Ej: Retiro en cajero Bancolombia, pago en efectivo';
    }

    return;
  }

  categoryWrapper?.classList.remove('d-none');
  categoryInput.required = true;
  updateCategoryDropdown(categoryInputId, normalizedType);

  sourceWrapper?.classList.remove('d-none');
  sourceInput.required = true;

  destinationInput.required = false;
  destinationInput.value = getAlternativeTransactionSource(sourceInput.value);
  destinationWrapper?.classList.add('d-none');

  bankWrapper?.classList.add('d-none');
  bankInput.required = false;

  updateSourceFieldTexts(sourceLabelId, sourceHelpId, normalizedType);

  updateDescriptionPlaceholderForCategory(prefix, normalizedType);
}

function normalizeTransactionType(transactionType) {
  return VALID_TRANSACTION_TYPES.includes(transactionType) ? transactionType : 'income';
}

function getAlternativeTransactionSource(source) {
  const normalizedSource = normalizeTransactionSource(source);

  if (normalizedSource === 'wallet') {
    return 'savings';
  }

  return 'wallet';
}

// Función para agregar una transacción a Firestore
async function addTransaction() {
  const transactionForm = document.getElementById('transactionForm');
  const transactionType = normalizeTransactionType(document.querySelector('input[name="transactionType"]:checked').value);
  const amount = parseFloat(document.getElementById('amountInput').value);
  const categoryInput = document.getElementById('categoryInput');
  const description = document.getElementById('descriptionInput').value.trim();
  const bankInput = document.getElementById('bankInput');
  const selectedBank = bankInput?.value || '';

  let source;
  let destinationSource = null;

  if (transactionType === 'transfer') {
    source = 'savings';
    destinationSource = 'wallet';
  } else {
    source = normalizeTransactionSource(document.getElementById('sourceInput').value);
    const destinationInput = document.getElementById('destinationInput');
    destinationSource = destinationInput?.value
      ? normalizeTransactionSource(destinationInput.value)
      : null;
  }

  const selectedMonth = getSelectedMonthValue();

  if (!currentUser) return;

  if (bankInput) {
    bankInput.setCustomValidity(
      transactionType === 'transfer' && !selectedBank
        ? 'Debes seleccionar el banco del cual retiras.'
        : ''
    );
  }

  if (!transactionForm?.reportValidity()) {
    return;
  }

  const category = transactionType === 'transfer'
    ? DEFAULT_TRANSFER_CATEGORY
    : categoryInput.value;

  try {
    const payload = {
      userId: currentUser.uid,
      type: transactionType,
      amount: amount,
      category: category,
      description: description,
      source,
      destinationSource: transactionType === 'transfer' ? destinationSource : null,
      bank: transactionType === 'transfer' ? selectedBank : null,
      date: Timestamp.fromDate(buildTransactionDateForMonth(selectedMonth))
    };

    await addDoc(collection(db, 'transactions'), payload);

    // Limpiar formulario
    transactionForm.reset();
    document.getElementById('incomeType').checked = true;
    document.getElementById('sourceInput').value = DEFAULT_TRANSACTION_SOURCE;
    document.getElementById('destinationInput').value = getAlternativeTransactionSource(DEFAULT_TRANSACTION_SOURCE);
    syncTransactionFormFields('', 'income');

    // Mantener el mes seleccionado para que la nueva transacción quede en ese mismo periodo
    const monthSelector = document.getElementById('monthSelector');
    if (monthSelector) {
      monthSelector.value = selectedMonth;
      updatePeriodTexts(monthSelector.value);
    }

    // Recargar datos
    await loadTransactions();
  } catch (error) {
    console.error('Error al agregar transacción:', error);
  }
}

// Función para cargar transacciones y actualizar el dashboard
async function loadTransactions() {
  if (!currentUser) return;

  const monthSelector = document.getElementById('monthSelector');
  const selectedMonth = getSelectedMonthValue();
  if (monthSelector) {
    monthSelector.max = getCurrentMonthValue();
    monthSelector.value = selectedMonth;
  }
  updatePeriodTexts(selectedMonth);
  const { startOfMonth, startOfNextMonth } = getMonthDateRange(selectedMonth);

  try {
    let querySnapshot;

    try {
      // Intentar consultar únicamente el mes seleccionado
      const monthlyQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', currentUser.uid),
        where('date', '>=', Timestamp.fromDate(startOfMonth)),
        where('date', '<', Timestamp.fromDate(startOfNextMonth))
      );

      querySnapshot = await getDocs(monthlyQuery);
    } catch (queryError) {
      console.warn('No fue posible filtrar por fecha directamente en Firestore. Se aplicará filtrado local.', queryError);

      const fallbackQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', currentUser.uid)
      );

      querySnapshot = await getDocs(fallbackQuery);
    }

    const transactions = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const transDate = data.date?.toDate?.();

      // Filtrar solo transacciones del mes seleccionado
      if (transDate && transDate >= startOfMonth && transDate < startOfNextMonth) {
        transactions.push({
          id: doc.id,
          ...data,
          type: normalizeTransactionType(data.type),
          source: normalizeTransactionSource(data.source),
          destinationSource: data.destinationSource
            ? normalizeTransactionSource(data.destinationSource)
            : null,
          date: transDate
        });
      }
    });

    // Ordenar transacciones por fecha (más reciente primero)
    transactions.sort((a, b) => b.date - a.date);
    currentTransactions = transactions;

    // Actualizar resumen, gráfico y tabla
    currentSummary = updateSummary(transactions);
    updateExpenseChart(transactions);
    applyTransactionFilters();
  } catch (error) {
    currentTransactions = [];
    visibleTransactions = [];
    currentSummary = updateSummary([]);
    applyTransactionFilters();
    console.error('Error al cargar transacciones:', error);
  }
}

// Función para actualizar las tarjetas de resumen
function updateSummary(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;
  const sourceBalances = getEmptySourceBalances();

  transactions.forEach((t) => {
    const transactionType = normalizeTransactionType(t.type);
    const source = normalizeTransactionSource(t.source);
    const destinationSource = t.destinationSource
      ? normalizeTransactionSource(t.destinationSource)
      : null;

    if (transactionType === 'income') {
      if (source === 'wallet' || source === 'savings') {
        totalIncome += t.amount;
        sourceBalances[source] += t.amount;
      }
    } else if (transactionType === 'expense') {
      totalExpenses += t.amount;
      if (sourceBalances.hasOwnProperty(source)) {
        sourceBalances[source] -= t.amount;
      }
    } else if (destinationSource) {
      if (sourceBalances.hasOwnProperty(source)) {
        sourceBalances[source] -= t.amount;
      }
      if (sourceBalances.hasOwnProperty(destinationSource)) {
        sourceBalances[destinationSource] += t.amount;
      }
    }
  });

  const totalBalance = totalIncome - totalExpenses;

  // Actualizar el DOM
  const totalIncomeElement = document.getElementById('totalIncome');
  const totalExpensesElement = document.getElementById('totalExpenses');

  if (totalIncomeElement) {
    totalIncomeElement.textContent = formatCurrency(totalIncome);
  }

  if (totalExpensesElement) {
    totalExpensesElement.textContent = formatCurrency(totalExpenses);
  }

  updateSourceBalanceCards(sourceBalances);

  return {
    totalIncome,
    totalExpenses,
    totalBalance,
    sourceBalances
  };
}

// Obtiene los colores de la gráfica basados en los grupos principales de gastos
function getChartColors() {
  return [
    "#B04A1E",
    "#C98A1F",
    "#136EA4",
    "#8B1A3C",
    "#5B6570"
  ];
}

// Devuelve el grupo principal al que pertenece una subcategoría de gasto
function getExpenseGroupForCategory(category) {
  if (!category) return Object.keys(CATEGORIES.expense || {}).length - 1;

  const groups = CATEGORIES.expense || {};
  const groupNames = Object.keys(groups);

  for (let index = 0; index < groupNames.length; index++) {
    const groupName = groupNames[index];
    const subcategories = groups[groupName] || [];
    if (subcategories.includes(category)) {
      return index;
    }
  }

  const legacyMapped = mapLegacyExpenseCategory(category);
  if (legacyMapped && legacyMapped !== category) {
    for (let index = 0; index < groupNames.length; index++) {
      const groupName = groupNames[index];
      const subcategories = groups[groupName] || [];
      if (subcategories.includes(legacyMapped)) {
        return index;
      }
    }
  }

  return groupNames.length - 1;
}

// Obtiene el color que corresponde a una categoría de gasto según su grupo principal
function getColorForExpenseCategory(category) {
  const chartColors = getChartColors();
  const groupIndex = getExpenseGroupForCategory(category);
  return chartColors[groupIndex % chartColors.length];
}

// Función para actualizar el gráfico de gastos por categoría
function updateExpenseChart(transactions) {
  const categoryTotals = {};

  // Calcular totales por categoría solo para gastos
  transactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      if (!categoryTotals[t.category]) {
        categoryTotals[t.category] = 0;
      }
      categoryTotals[t.category] += t.amount;
    });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  // Obtener contexto del canvas
  const ctx = document.getElementById('expenseChart').getContext('2d');

  // Destruir gráfico anterior si existe
  if (expenseChart) {
    expenseChart.destroy();
  }

  // Crear nuevo gráfico
  expenseChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gastos por Categoría',
        data: data,
        backgroundColor: labels.map((category) => getColorForExpenseCategory(category)),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            font: {
              size: 14,
              weight: '500'
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw;
              return `${label}: ${formatCurrency(value)}`;
            }
          }
        }
      }
    }
  });
}

// Función para actualizar la tabla de transacciones
function updateTransactionTable(transactions) {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  tbody.innerHTML = ''; // Limpiar tabla

  if (transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          ${currentSearchTerm
            ? 'No hay transacciones que coincidan con la categoría buscada.'
            : 'No hay transacciones registradas para el mes seleccionado.'}
        </td>
      </tr>
    `;
    return;
  }

  transactions.forEach(transaction => {
    const row = document.createElement('tr');
    const transactionType = normalizeTransactionType(transaction.type);
    const typeMeta = getTransactionTypeMeta(transactionType);
    const amountMeta = getTransactionAmountMeta(transaction);
    const bankLabel = transaction.bank || '-';

    row.innerHTML = `
      <td class="text-center">
        <span class="badge ${typeMeta.badgeClass}">
          <i class="fas ${typeMeta.icon}"></i>
          ${typeMeta.label}
        </span>
      </td>
      <td>${getTransactionCategoryLabel(transaction)}</td>
      <td>${bankLabel}</td>
      <td>${formatTransactionMovement(transaction)}</td>
      <td>${transaction.description || '-'}</td>
      <td class="fw-semibold text-end ${amountMeta.className}">
        ${amountMeta.prefix}${formatCurrency(transaction.amount)}
      </td>
      <td class="text-muted small text-end">
        ${transaction.date.toLocaleDateString('es-CO', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </td>
      <td class="text-center">
        <div class="d-flex justify-content-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-primary edit-transaction-btn" data-id="${transaction.id}" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger delete-transaction-btn" data-id="${transaction.id}" title="Eliminar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function updateDescriptionPlaceholderForCategory(prefix, transactionType) {
  const descriptionInputId = prefix ? 'editDescriptionInput' : 'descriptionInput';
  const categoryInputId = prefix ? 'editCategoryInput' : 'categoryInput';
  const descriptionInput = document.getElementById(descriptionInputId);
  const categoryInput = document.getElementById(categoryInputId);
  if (!descriptionInput || !categoryInput) return;
  const normalizedType = normalizeTransactionType(transactionType);
  if (normalizedType === 'transfer') {
    descriptionInput.placeholder = 'Ej: Traslado de ahorros a efectivo';
    return;
  }
  const selectedCategory = categoryInput.value;
  if (normalizedType === 'expense') {
    descriptionInput.placeholder = getDescriptionPlaceholderForExpense(selectedCategory);
    return;
  }
  descriptionInput.placeholder = getDescriptionPlaceholderForIncome(selectedCategory);
}

// Función para abrir el modal de edición
function openEditModal(transactionId, transactions) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) return;
  const transactionType = normalizeTransactionType(transaction.type);
  const mappedCategory = getTransactionCategoryLabel(transaction);

  // Llenar el formulario con los datos de la transacción
  document.getElementById('editTransactionId').value = transactionId;
  document.getElementById('editAmountInput').value = transaction.amount;
  document.getElementById('editDescriptionInput').value = transaction.description || '';
  document.getElementById('editSourceInput').value = normalizeTransactionSource(transaction.source);
  document.getElementById('editDestinationInput').value = transaction.destinationSource
    ? normalizeTransactionSource(transaction.destinationSource)
    : getAlternativeTransactionSource(transaction.source);

  // Seleccionar el tipo de transacción correcto
  const typeInput = document.querySelector(`input[name="editTransactionType"][value="${transactionType}"]`);
  if (typeInput) typeInput.checked = true;
  syncTransactionFormFields('edit', transactionType);
  updateCategoryDropdown('editCategoryInput', transactionType, mappedCategory);
  updateDescriptionPlaceholderForCategory('edit', transactionType);

  if (transactionType === 'transfer') {
    const editBankInput = document.getElementById('editBankInput');
    if (editBankInput) {
      updateBankDropdown('editBankInput', transaction.bank || '');
    }
  }

  // Mostrar el modal
  if (editModal) editModal.show();
}

// Función para guardar los cambios de una transacción
async function saveTransactionEdit() {
  const editTransactionForm = document.getElementById('editTransactionForm');
  const transactionId = document.getElementById('editTransactionId').value;
  const transactionType = normalizeTransactionType(document.querySelector('input[name="editTransactionType"]:checked').value);
  const amount = parseFloat(document.getElementById('editAmountInput').value);
  const categoryInput = document.getElementById('editCategoryInput');
  const description = document.getElementById('editDescriptionInput').value.trim();
  const bankInput = document.getElementById('editBankInput');
  const selectedBank = bankInput?.value || '';

  let source;
  let destinationSource = null;

  if (transactionType === 'transfer') {
    source = 'savings';
    destinationSource = 'wallet';
  } else {
    source = normalizeTransactionSource(document.getElementById('editSourceInput').value);
    const destinationInput = document.getElementById('editDestinationInput');
    destinationSource = destinationInput?.value
      ? normalizeTransactionSource(destinationInput.value)
      : null;
  }

  if (!transactionId || !currentUser) return;

  if (bankInput) {
    bankInput.setCustomValidity(
      transactionType === 'transfer' && !selectedBank
        ? 'Debes seleccionar el banco del cual retiras.'
        : ''
    );
  }

  if (!editTransactionForm?.reportValidity()) {
    return;
  }

  const category = transactionType === 'transfer'
    ? DEFAULT_TRANSFER_CATEGORY
    : categoryInput.value;

  try {
    const transactionDocRef = doc(db, 'transactions', transactionId);
    await updateDoc(transactionDocRef, {
      type: transactionType,
      amount: amount,
      category: category,
      description: description,
      source,
      destinationSource: transactionType === 'transfer' ? destinationSource : null,
      bank: transactionType === 'transfer' ? selectedBank : null
    });

    // Cerrar el modal
    if (editModal) editModal.hide();

    // Recargar datos
    await loadTransactions();
  } catch (error) {
    console.error('Error al editar transacción:', error);
  }
}

// Asegura que el modal de eliminar quede SIEMPRE encima del backdrop (z-index + estilos)
function forceDeleteModalAboveBackdrop(deleteModalElement) {
  if (!deleteModalElement) return;

  const backdrops = document.querySelectorAll('.modal-backdrop');
  let backdropZ = 1040;
  backdrops.forEach(backdrop => {
    const current = Number(window.getComputedStyle(backdrop).zIndex || 0);
    if (current > backdropZ) backdropZ = current;
  });

  deleteModalElement.style.zIndex = String(backdropZ + 20);
  const dialog = deleteModalElement.querySelector('.modal-dialog');
  if (dialog) {
    dialog.style.zIndex = String(backdropZ + 40);
  }

  deleteModalElement.style.position = 'fixed';
  deleteModalElement.style.top = '0';
  deleteModalElement.style.left = '0';
  deleteModalElement.style.right = '0';
  deleteModalElement.style.bottom = '0';

  // Si Bootstrap activó show, lo mantenemos; si no lo pintamos fallback
  const isVisible = deleteModalElement.classList.contains('show');
  if (isVisible) {
    deleteModalElement.style.display = 'block';
    deleteModalElement.style.visibility = 'visible';
    deleteModalElement.removeAttribute('aria-hidden');
    deleteModalElement.setAttribute('aria-modal', 'true');
  }
}

// Elimina backdrop huérfanos y resetea el body solo si no hay ningún modal visible
function cleanupOrphanBackdrops() {
  const visibleModals = document.querySelectorAll('.modal.show');
  const expectedBackdrops = visibleModals.length;
  const allBackdrops = document.querySelectorAll('.modal-backdrop');

  if (allBackdrops.length > expectedBackdrops) {
    allBackdrops.forEach((backdrop, index) => {
      if (index >= expectedBackdrops) {
        backdrop.remove();
      }
    });
  }

  if (visibleModals.length === 0) {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

// Cierra el modal de eliminar delegando 100% en Bootstrap Modal
function closeDeleteModal() {
  const deleteModalElement = document.getElementById('deleteTransactionModal');
  if (deleteModalElement && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    const instance = bootstrap.Modal.getInstance(deleteModalElement)
      || (deleteModal ? deleteModal : null);

    if (instance) {
      try {
        instance.hide();
      } catch (error) {
        console.warn('No se pudo ocultar el modal de eliminar:', error);
      }
    }
  }

  setTimeout(() => {
    cleanupOrphanBackdrops();
  }, 100);
}

// Abre el modal de eliminar delegando 100% en Bootstrap Modal
function openDeleteModal(transactionId) {
  const deleteModalElement = document.getElementById('deleteTransactionModal');
  if (!deleteModalElement) {
    console.warn('No existe el modal #deleteTransactionModal en dashboard.html');
    return;
  }

  cleanupOrphanBackdrops();
  transactionToDeleteId = transactionId;

  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.warn('Bootstrap Modal no está cargado.');
    return;
  }

  let instance = deleteModal || bootstrap.Modal.getInstance(deleteModalElement);
  if (!instance) {
    instance = new bootstrap.Modal(deleteModalElement, {
      backdrop: 'static',
      keyboard: false,
      focus: true
    });
    deleteModal = instance;
  }

  try {
    instance.show();
  } catch (error) {
    console.warn('Fallo al mostrar modal de eliminar con Bootstrap, fallback manual:', error);
  }

  // Fallback absoluto: si Bootstrap NO lo pintó (por alguna razón interna),
  // nos aseguramos de que los estilos mínimos estén y quede por encima
  setTimeout(() => {
    const el = document.getElementById('deleteTransactionModal');
    if (!el) return;
    if (!el.classList.contains('show')) {
      el.classList.add('show');
    }
    if (el.style.display !== 'block') {
      el.style.display = 'block';
    }
    el.removeAttribute('aria-hidden');
    el.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    forceDeleteModalAboveBackdrop(el);
    cleanupOrphanBackdrops();
  }, 120);
}

// Función para eliminar una transacción
async function deleteTransaction() {
  if (!transactionToDeleteId || !currentUser) return;

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const originalBtnHtml = confirmBtn ? confirmBtn.innerHTML : null;

  try {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin me-1"></i> Eliminando...';
    }

    const transactionDocRef = doc(db, 'transactions', transactionToDeleteId);
    await deleteDoc(transactionDocRef);

    if (confirmBtn && originalBtnHtml) {
      confirmBtn.innerHTML = originalBtnHtml;
      confirmBtn.disabled = false;
    }

    closeDeleteModal();

    const searchInput = document.getElementById('transactionSearchInput');
    if (searchInput) {
      searchInput.value = '';
      currentSearchTerm = '';
    }

    await loadTransactions();
  } catch (error) {
    console.error('Error al eliminar transacción:', error);
    if (confirmBtn && originalBtnHtml) {
      confirmBtn.innerHTML = originalBtnHtml;
      confirmBtn.disabled = false;
    }
    closeDeleteModal();
    alert('No se pudo eliminar la transacción. Por favor, intenta de nuevo.');
  }
}

// Actualiza el estado del botón de exportación
function updateExportButtonState(transactions) {
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (!exportCsvBtn) return;

  exportCsvBtn.disabled = transactions.length === 0;
}

function applyTransactionFilters() {
  visibleTransactions = filterTransactionsByCategory(currentTransactions, currentSearchTerm);
  updateTransactionTable(visibleTransactions);
  updateExportButtonState(visibleTransactions);
}

function filterTransactionsByCategory(transactions, searchTerm) {
  const normalizedSearchTerm = normalizeSearchText(searchTerm);

  if (!normalizedSearchTerm) {
    return [...transactions];
  }

  return transactions.filter(transaction => {
    const categoryLabel = getTransactionCategoryLabel(transaction);
    return normalizeSearchText(categoryLabel || '').includes(normalizedSearchTerm);
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function updateSourceFieldTexts(labelId, helpId, transactionType) {
  const labelElement = document.getElementById(labelId);
  const helpElement = document.getElementById(helpId);

  if (labelElement) {
    labelElement.textContent = transactionType === 'expense' ? 'Descontar de' : 'Agregar a';
  }

  if (helpElement) {
    helpElement.textContent = transactionType === 'expense'
      ? 'Selecciona de qué sector saldrá este gasto.'
      : 'Selecciona en qué sector se sumará este ingreso.';
  }
}

function getEmptySourceBalances() {
  return {
    wallet: 0,
    savings: 0
  };
}

function normalizeTransactionSource(source) {
  return TRANSACTION_SOURCES[source] ? source : DEFAULT_TRANSACTION_SOURCE;
}

function getTransactionSourceMeta(source) {
  return TRANSACTION_SOURCES[normalizeTransactionSource(source)];
}

function getTransactionTypeMeta(transactionType) {
  const normalizedType = normalizeTransactionType(transactionType);

  if (normalizedType === 'expense') {
    return {
      label: 'Gasto',
      icon: 'fa-arrow-up',
      badgeClass: 'bg-danger'
    };
  }

  if (normalizedType === 'transfer') {
    return {
      label: 'Retiro Bancario',
      icon: 'fa-right-left',
      badgeClass: 'bg-primary'
    };
  }

  return {
    label: 'Ingreso',
    icon: 'fa-arrow-down',
    badgeClass: 'bg-success'
  };
}

function getTransactionAmountMeta(transaction) {
  const transactionType = normalizeTransactionType(transaction.type);

  if (transactionType === 'expense') {
    return {
      prefix: '- ',
      className: 'text-danger'
    };
  }

  if (transactionType === 'transfer') {
    return {
      prefix: '↔ ',
      className: 'text-primary'
    };
  }

  return {
    prefix: '+ ',
    className: 'text-success'
  };
}

// function getIncomeCategoryGroup(subcategory) {
//   if (!subcategory) return null;
//   const groups = CATEGORIES.income || {};
//   const groupNames = Object.keys(groups);
//   for (let i = 0; i < groupNames.length; i++) {
//     const groupName = groupNames[i];
//     if ((groups[groupName] || []).includes(subcategory)) {
//       return groupName;
//     }
//   }
//   return null;
// }

function getDescriptionPlaceholderForIncome(subcategory) {
  if (!subcategory) return 'Ej: Ingreso extra del mes';
  const placeholders = {
    "Sueldos y salarios": "Ej: Nómina mes de agosto, empresa XYZ",
    "Horas extras y recargos": "Ej: 12 horas extras nocturnas + recargo dominical",
    "Primas, bonos y cesantías": "Ej: Prima de servicios mitad de año 2026",
    "Comisiones por ventas": "Ej: Comisiones ventas julio - 3 ventas cerradas",
    "Honorarios profesionales": "Ej: Factura #123 cliente ABC - consultoría",
    "Ventas de productos o servicios": "Ej: Venta de 5 cursos online, plataforma X",
    "Ganancias de emprendimiento o negocio propio": "Ej: Cierre mensual negocio de comida - utilidad julio",
    "Alquiler o renta de bienes (casas, locales, vehículos)": "Ej: Arriendo local comercial - mes de agosto",
    "Dividendos de acciones": "Ej: Dividendos trimestrales fondo de inversión X",
    "Intereses de cuentas de ahorro o CDT": "Ej: Intereses CDT vencimiento 30/08/2026",
    "Regalías": "Ej: Regalías por ventas de libro - trimestre 3",
    "Pensiones o subsidios del gobierno": "Ej: Pensión adulto mayor mes de agosto",
    "Remesas o dinero de familiares": "Ej: Remesa enviada por familiar desde el exterior",
    "Regalos, premios o loterías (ingresos ocasionales)": "Ej: Premio rifa empresarial - bicicleta",
    "Venta de artículos usados o activos que ya no usas": "Ej: Venta de laptop usada por Mercado Libre"
  };
  return placeholders[subcategory] || 'Ej: Agrega detalles de este ingreso';
}

function getDescriptionPlaceholderForExpense(subcategory) {
  if (!subcategory) return 'Ej: Pago de arriendo, supermercado semana 2';
  const placeholders = {
    "Vivienda (Alquiler / Cuota Crédito)": "Ej: Pago arriendo apartamento agosto - Arrendador XYZ",
    "Servicios Básicos (Luz, Agua, Gas, Internet)": "Ej: Factura EPM - mes de agosto, consumo 180 kWh",
    "Hogar (Mantenimiento, Aseo, Reparaciones)": "Ej: Compra insumos de aseo + cambio bombillo",
    "Alimentación (Mercado y Supermercado)": "Ej: Mercado semanal - frutas, verduras y carne",
    "Comidas fuera (Restaurantes y Apps)": "Ej: Almuerzo en restaurante + 2 domicilios Rappi",
    "Ocio, Salidas y Suscripciones": "Ej: Netflix + cine con amigos, salida al parque",
    "Compras (Ropa, Cuidado personal, Varios)": "Ej: Zapatos nuevos + corte de cabello",
    "Transporte (Público, Gasolina, Peajes)": "Ej: Gasolina tanque lleno + 2 pasajes TransMilenio",
    "Vehículo (Mantenimiento, Seguro, Impuestos)": "Ej: SOAT vencimiento + cambio de aceite",
    "Deudas y Tarjetas de Crédito": "Ej: Pago mínimo tarjeta Visa - cuota #3",
    "Salud (Médicos, Farmacia, Seguros)": "Ej: Consulta médico general + medicamentos",
    "Educación y Crecimiento": "Ej: Curso Udemy + libros semanales",
    "Otros Gastos": "Ej: Regalo de cumpleaños para amigo"
  };
  return placeholders[subcategory] || 'Ej: Agrega detalles de este gasto';
}

function getTransactionCategoryLabel(transaction) {
  if (normalizeTransactionType(transaction.type) === 'transfer') {
    return '-';
  }
  return mapLegacyCategory(transaction.type, transaction.category || '-');
}

function formatTransactionMovement(transaction) {
  const sourceMeta = getTransactionSourceMeta(transaction.source);
  const transactionType = normalizeTransactionType(transaction.type);

  if (transactionType === 'transfer' && transaction.destinationSource) {
    const destinationMeta = getTransactionSourceMeta(transaction.destinationSource);

    return `
      <div class="d-flex flex-wrap align-items-center gap-1">
        <span class="badge text-bg-light border">
          <i class="fas ${sourceMeta.icon} me-1"></i>${sourceMeta.label}
        </span>
        <i class="fas fa-arrow-right text-muted small"></i>
        <span class="badge text-bg-light border">
          <i class="fas ${destinationMeta.icon} me-1"></i>${destinationMeta.label}
        </span>
      </div>
    `;
  }

  return `
    <span class="badge text-bg-light border">
      <i class="fas ${sourceMeta.icon} me-1"></i>
      ${sourceMeta.label}
    </span>
  `;
}

function updateSourceBalanceCards(sourceBalances) {
  const walletBalance = document.getElementById('walletBalance');
  const savingsBalance = document.getElementById('savingsBalance');

  if (walletBalance) {
    walletBalance.textContent = formatCurrency(sourceBalances.wallet);
  }

  if (savingsBalance) {
    savingsBalance.textContent = formatCurrency(sourceBalances.savings);
  }
}

function setupAmountNumericInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('beforeinput', (e) => {
    if (!e.data) return;
    if (!/^\d+$/.test(e.data)) {
      e.preventDefault();
    }
  });

  input.addEventListener('input', () => {
    const raw = input.value || '';
    const digits = raw.replace(/\D/g, '');

    if (digits && digits !== '0') {
      input.value = digits.replace(/^0+/, '') || '0';
    } else {
      input.value = digits ? '0' : '';
    }
  });

  input.addEventListener('keydown', (e) => {
    const allowedKeys = [
      'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'
    ];

    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  });
}

const MONTH_PERSISTENCE_KEY = 'fintrac_selected_month';

function persistMonthValue(monthValue) {
  try {
    const normalized = normalizeMonthValue(monthValue);
    window.localStorage.setItem(MONTH_PERSISTENCE_KEY, normalized);
  } catch (error) {
    console.warn('No se pudo persistir el mes seleccionado:', error);
  }
}

function getPersistedMonthValue() {
  try {
    const stored = window.localStorage.getItem(MONTH_PERSISTENCE_KEY);
    if (!stored) {
      return normalizeMonthValue(getCurrentMonthValue());
    }

    const currentMonthValue = getCurrentMonthValue();
    if (stored > currentMonthValue) {
      window.localStorage.removeItem(MONTH_PERSISTENCE_KEY);
      return currentMonthValue;
    }

    return normalizeMonthValue(stored);
  } catch (error) {
    console.warn('No se pudo cargar el mes persistido:', error);
    return normalizeMonthValue(getCurrentMonthValue());
  }
}

// Obtiene siempre un mes valido, sin permitir meses futuros
function getSelectedMonthValue() {
  const monthSelector = document.getElementById('monthSelector');
  const rawMonthValue = monthSelector?.value || getPersistedMonthValue();
  return normalizeMonthValue(rawMonthValue);
}

// Obtiene el valor del mes actual en formato YYYY-MM
function getCurrentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Corrige el valor del selector para evitar meses vacios o futuros
function normalizeMonthValue(monthValue) {
  const currentMonthValue = getCurrentMonthValue();

  if (!monthValue) {
    return currentMonthValue;
  }

  return monthValue > currentMonthValue ? currentMonthValue : monthValue;
}

// Crea la fecha de una nueva transacción dentro del mes seleccionado
function buildTransactionDateForMonth(monthValue) {
  const now = new Date();
  const [year, month] = monthValue.split('-').map(Number);
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const day = Math.min(now.getDate(), lastDayOfMonth);

  return new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
}

// Obtiene las fechas de inicio y fin del mes seleccionado
function getMonthDateRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const startOfNextMonth = new Date(year, month, 1);

  return { startOfMonth, startOfNextMonth };
}

// Actualiza los textos del periodo actual en toda la interfaz
function updatePeriodTexts(monthValue) {
  updateSelectedMonthLabel(monthValue);
  updateSummaryLabels(monthValue);
  updateExpenseChartTitle(monthValue);
}

// Actualiza el texto que muestra el mes seleccionado
function updateSelectedMonthLabel(monthValue) {
  const label = document.getElementById('selectedMonthLabel');
  if (!label || !monthValue) return;

  label.textContent = `Mes seleccionado: ${formatMonthLabel(monthValue)}`;
}

// Actualiza los titulos de las tarjetas de resumen
function updateSummaryLabels(monthValue) {
  const formattedMonth = formatMonthLabel(monthValue);
  const sourceBalancesLabel = document.getElementById('sourceBalancesLabel');
  const totalIncomeLabel = document.getElementById('totalIncomeLabel');
  const totalExpensesLabel = document.getElementById('totalExpensesLabel');

  if (sourceBalancesLabel) {
    sourceBalancesLabel.textContent = `Saldos por Sector (${formattedMonth})`;
  }

  if (totalIncomeLabel) {
    totalIncomeLabel.textContent = `Ingresos (${formattedMonth})`;
  }

  if (totalExpensesLabel) {
    totalExpensesLabel.textContent = `Gastos (${formattedMonth})`;
  }
}

// Actualiza el titulo del grafico segun el mes seleccionado
function updateExpenseChartTitle(monthValue) {
  const title = document.getElementById('expenseChartTitle');
  if (!title) return;

  title.innerHTML = `<i class="fas fa-chart-pie me-1"></i> Distribución de Gastos (${formatMonthLabel(monthValue)})`;
}

// Formatea el mes seleccionado para mostrarlo en pantalla
function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric'
  }).replace(/^\w/, char => char.toUpperCase());
}

// Función para formatear números como Pesos Colombianos
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Helpers que se usan tanto para la tabla del historial como para el Excel exportado
function getFormattedTransactionTypeLabel(transactionType) {
  const typeMeta = getTransactionTypeMeta(transactionType);
  return typeMeta?.label || 'Ingreso';
}

function getFormattedTransactionSourceLabel(source) {
  const sourceMeta = getTransactionSourceMeta(source);
  return sourceMeta?.label || TRANSACTION_SOURCES.wallet.label;
}

function getFormattedTransactionDestinationLabel(destinationSource) {
  if (!destinationSource) return null;
  const destMeta = getTransactionSourceMeta(destinationSource);
  return destMeta?.label || null;
}

function getFormattedTransactionMovementText(transaction) {
  const sourceLabel = getFormattedTransactionSourceLabel(transaction.source);
  const transactionType = normalizeTransactionType(transaction.type);

  if (transactionType === 'transfer' && transaction.destinationSource) {
    const destinationLabel = getFormattedTransactionDestinationLabel(transaction.destinationSource);
    if (destinationLabel) {
      return `${sourceLabel} → ${destinationLabel}`;
    }
  }

  return sourceLabel;
}

function getFormattedBankLabel(transaction) {
  const transactionType = normalizeTransactionType(transaction.type);
  if (transactionType === 'transfer') {
    return transaction.bank || '-';
  }
  return '-';
}

function getFormattedAmountValueForExport(transaction) {
  const transactionType = normalizeTransactionType(transaction.type);
  if (transactionType === 'expense') {
    return -Math.abs(transaction.amount);
  }
  return transaction.amount;
}