// Pure types for the sales domain — no React, no Supabase imports.

export type Canal = 'licitacion' | 'electronica' | 'pedido' | 'general';

export type TipoPago =
  | 'caja_mn'
  | 'banco_mn'
  | 'banco_me'
  | 'facebank'
  | 'facebank2'
  | 'facebank3'
  | 'usdt'
  | 'usdt2'
  | 'cxc'
  | 'cxc_electronica'
  | 'cxc_pedido'
  | 'cxc_licitaciones';

export type MetodoValuacion = 'CPP' | 'FIFO';

export interface SaleItemInput {
  product_id: string;
  product_nombre: string;
  product_codigo?: string | null;
  cuenta_inventario_id?: string | null;
  metodo_valuacion: MetodoValuacion;
  cantidad: number;
  precio_unitario_neto: number;
}

export interface SaleHeaderInput {
  fecha: string;            // YYYY-MM-DD
  canal: Canal;
  con_factura: boolean;
  tipo_pago: TipoPago | string; // string para métodos personalizados
  cliente_nombre?: string | null;
  glosa?: string | null;
  aux_entry_id?: string | null;
  /** Vendedor a comisión que cerró la venta (interno, no visible en el Catálogo). null = ninguno. */
  vendedor_member_id?: string | null;
}

export interface SaleTotals {
  total_cobrado: number;
  total_iva: number;
  total_it: number;
  precio_neto_total: number;
}

export interface ResolvedAccounts {
  payment_account: string;
  revenue_account: string;
  cogs_account: string;
}

export interface CreateSalePayload extends SaleHeaderInput, SaleTotals, ResolvedAccounts {
  items: SaleItemInput[];
}

export interface SaleRow {
  id: string;
  numero: string;
  fecha: string;
  canal: Canal;
  con_factura: boolean;
  tipo_pago: TipoPago;
  cliente_nombre: string | null;
  glosa: string | null;
  total_cobrado: number;
  total_iva: number;
  total_it: number;
  precio_neto_total: number;
  total_costo: number | null;
  journal_entry_id: string | null;
  estado: 'confirmed' | 'voided';
  void_reason: string | null;
  void_journal_entry_id: string | null;
  vendedor_member_id: string | null;
  created_at: string;
}

// ── Clientes ────────────────────────────────────────────────────────────────

export type CustomerTipo = 'empresa' | 'natural';

export interface CustomerRow {
  id: string;
  company_id: string;
  user_id: string;
  codigo: string | null;
  razon_social: string;
  nombre_corto: string | null;
  tipo: CustomerTipo;
  nit: string | null;
  email: string | null;
  telefono: string | null;
  ciudad: string | null;
  credito_autorizado: number;
  dias_credito: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInput {
  razon_social: string;
  nombre_corto?: string;
  tipo?: CustomerTipo;
  nit?: string;
  email?: string;
  telefono?: string;
  ciudad?: string;
  credito_autorizado?: number;
  dias_credito?: number;
  notas?: string;
  activo?: boolean;
}

// ── Stock ────────────────────────────────────────────────────────────────────

export interface ProductStockInfo {
  product_id: string;
  stock: number;
  cpp: number;         // costo promedio ponderado (6 decimales)
  valor_total: number;
}

// ── Ítem enriquecido para el formulario (solo frontend, no va al backend) ───

export interface SaleItemEnriched extends SaleItemInput {
  _key: string;
  // precio lista + descuento → precio_unitario_neto es derivado
  precio_lista: number;
  descuento_pct: number;
  // campos de display calculados en frontend
  unidad_medida: string;
  descripcion: string | null;
  categoria: string | null;
  precio_minimo: number | null;
  stock_disponible: number | null;   // null = cargando
  cpp_unitario: number | null;
  margen_unitario: number | null;
  margen_porcentaje: number | null;
}
