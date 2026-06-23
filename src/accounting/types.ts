// src/accounting/types.ts
export const ACCOUNT_TYPES = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "GASTO"] as const;
export const SIDES = ["DEBE", "HABER"] as const;
export const EXPENSE_CATEGORIES = ["COSTO_VENTAS", "GASTO_OPERATIVO", "OTRO_GASTO"] as const;

export const CLASIFICACION_RESULTADO = [
  'ingreso_operativo', 'ingreso_no_operativo',
  'costo_ventas', 'gasto_operativo', 'gasto_no_operativo', 'impuesto'
] as const;

export const SUBCLASIFICACION_RESULTADO = [
  'ventas', 'devoluciones', 'otros_ingresos_operativos',
  'costo_mercaderia', 'costo_produccion', 'costo_servicios',
  'administrativos', 'ventas_marketing', 'logistica', 'depreciacion', 'amortizacion',
  'intereses', 'comisiones_bancarias', 'diferencial_cambiario',
  'otro'
] as const;

export const CLASIFICACION_FLUJO = [
  'operacion', 'inversion', 'financiamiento', 'no_aplica'
] as const;

export type AccountType = typeof ACCOUNT_TYPES[number];
export type Side = typeof SIDES[number];
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type ClasificacionResultado = typeof CLASIFICACION_RESULTADO[number];
export type SubclasificacionResultado = typeof SUBCLASIFICACION_RESULTADO[number];
export type ClasificacionFlujo = typeof CLASIFICACION_FLUJO[number];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  normal_side: Side;
  is_active: boolean;
  // Legacy classification fields (kept for backward compatibility)
  expense_category?: ExpenseCategory | null;
  is_cash_equivalent?: boolean;
  is_current?: boolean | null;
  // Advanced classification - Income Statement
  clasificacion_resultado?: ClasificacionResultado | null;
  subclasificacion_resultado?: SubclasificacionResultado | string | null;
  // Advanced classification - Cash Flow
  clasificacion_flujo?: ClasificacionFlujo | null;
  // Financial properties
  es_partida_no_monetaria?: boolean;
  es_capital_trabajo?: boolean;
  es_financiera?: boolean;
  es_extraordinaria?: boolean;
  afecta_ebitda?: boolean;
}

export interface JournalLine { 
  account_id: string; 
  debit: number; 
  credit: number; 
  line_memo?: string; 
}

export interface JournalEntry {
  id: string;
  date: string;
  /** Hora intradía opcional 'HH:mm'. Desempata el orden de asientos del mismo día. undefined = legacy (orden por id). */
  entry_time?: string;
  memo?: string;
  lines: JournalLine[];
  void_of?: string;
}

export interface AuxiliaryLedgerDefinition {
  id: string;
  name: string;
  account_id: string;
}

export interface AuxiliaryLedgerEntry {
  id: string;
  client_name: string;
  account_id: string;
  definition_id?: string;
  total_balance: number;
  closed_date?: string; // YYYY-MM-DD - fecha real de cierre
}

export interface AuxiliaryMovementDetail {
  id: string;
  aux_entry_id: string;
  journal_entry_id: string;
  movement_date: string;
  amount: number;
  movement_type: 'INCREASE' | 'DECREASE';
}

export type FiscalYearStatus = 'OPEN' | 'CLOSED';

export interface FiscalYear {
  id: string;
  company_id: string;
  year: number;
  start_date: string;  // YYYY-MM-DD
  end_date: string;    // YYYY-MM-DD
  status: FiscalYearStatus;
  net_result_snapshot: number | null;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KardexDefinition {
  id: string;
  name: string;
  account_id: string;
  user_id: string;
  created_at: string;
}

export interface KardexEntry {
  id: string;
  account_id: string;
  user_id: string;
  created_at: string;
}

export interface KardexMovement {
  id: string;
  kardex_id: string;
  user_id: string;
  fecha: string;
  concepto: string;
  entrada: number;
  salidas: number;
  saldo: number;
  costo_unitario: number;
  costo_total: number;
  saldo_valorado: number;
  journal_entry_id?: string;
  created_at: string;
}

// Label maps for UI display
export const CLASIFICACION_RESULTADO_LABELS: Record<ClasificacionResultado, string> = {
  ingreso_operativo: 'Ingreso Operativo',
  ingreso_no_operativo: 'Ingreso No Operativo',
  costo_ventas: 'Costo de Ventas',
  gasto_operativo: 'Gasto Operativo',
  gasto_no_operativo: 'Gasto No Operativo',
  impuesto: 'Impuesto',
};

export const CLASIFICACION_FLUJO_LABELS: Record<ClasificacionFlujo, string> = {
  operacion: 'Operación',
  inversion: 'Inversión',
  financiamiento: 'Financiamiento',
  no_aplica: 'No Aplica',
};

export const SUBCLASIFICACION_RESULTADO_LABELS: Record<SubclasificacionResultado, string> = {
  ventas: 'Ventas',
  devoluciones: 'Devoluciones',
  otros_ingresos_operativos: 'Otros Ingresos Operativos',
  costo_mercaderia: 'Costo de Mercadería',
  costo_produccion: 'Costo de Producción',
  costo_servicios: 'Costo de Servicios',
  administrativos: 'Administrativos',
  ventas_marketing: 'Ventas y Marketing',
  logistica: 'Logística',
  depreciacion: 'Depreciación',
  amortizacion: 'Amortización',
  intereses: 'Intereses',
  comisiones_bancarias: 'Comisiones Bancarias',
  diferencial_cambiario: 'Diferencial Cambiario',
  otro: 'Otro',
};

// Seeds (ES)
export const seedAccounts: Account[] = [
  { id: "A.1",  name: "Banco MN",            type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.2",  name: "Caja MN",             type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.3",  name: "Banco ME",            type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.4",  name: "Inventario",          type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.5",  name: "Cuentas por Cobrar",  type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.6",  name: "Crédito Fiscal IVA",  type: "ACTIVO",      normal_side: "DEBE",  is_active: true },
  { id: "A.7",  name: "USDT",                type: "ACTIVO",      normal_side: "DEBE",  is_active: true },

  { id: "G.1",  name: "Gastos Generales",    type: "GASTO",       normal_side: "DEBE",  is_active: true },
  { id: "G.2",  name: "Flete Aéreo",         type: "GASTO",       normal_side: "DEBE",  is_active: true },
  { id: "G.3",  name: "IT",                  type: "GASTO",       normal_side: "DEBE",  is_active: true },
  { id: "G.4",  name: "Costo de Ventas",     type: "GASTO",       normal_side: "DEBE",  is_active: true },

  { id: "I.1",  name: "Ventas",              type: "INGRESO",     normal_side: "HABER", is_active: true },

  { id: "P.1",  name: "Cuentas por Pagar",   type: "PASIVO",      normal_side: "HABER", is_active: true },
  { id: "P.2",  name: "IT por Pagar",        type: "PASIVO",      normal_side: "HABER", is_active: true },
  { id: "P.3",  name: "Débito Fiscal IVA",   type: "PASIVO",      normal_side: "HABER", is_active: true },

  { id: "Pn.1", name: "Capital",             type: "PATRIMONIO",  normal_side: "HABER", is_active: true },
];
