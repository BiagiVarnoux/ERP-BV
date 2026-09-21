// Tipos puros del módulo de Impuestos — sin React, sin Supabase.

/** 'compra' alimenta el crédito fiscal; 'venta' el débito fiscal. */
export type TaxDocTipo = 'compra' | 'venta';

export type TaxDocEstado = 'vigente' | 'anulada';

export type TaxTipoDocumento =
  | 'factura'
  | 'nota_credito'
  | 'nota_debito'
  | 'dui'             // Declaración Única de Importación (IVA de aduana)
  | 'recibo_alquiler'
  | 'otro';

export interface TaxDocumentRow {
  id: string;
  company_id: string;
  user_id: string | null;
  tipo: TaxDocTipo;
  fecha: string;                 // YYYY-MM-DD (emisión)
  periodo: string;               // YYYY-MM (período de declaración)
  nit: string | null;
  razon_social: string;
  tipo_documento: TaxTipoDocumento;
  numero_factura: string | null;
  numero_autorizacion: string | null;
  codigo_control: string | null;
  importe_total: number;
  importe_ice: number;
  importe_exento: number;
  descuentos: number;
  base_imponible: number;
  alicuota: number;
  iva: number;
  estado: TaxDocEstado;
  con_derecho_credito: boolean;
  sale_id: string | null;
  payable_id: string | null;
  journal_entry_id: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Importes crudos que capta el formulario; `base_imponible` e `iva` se derivan. */
export interface TaxAmountsInput {
  importe_total: number;
  importe_ice?: number;
  importe_exento?: number;
  descuentos?: number;
  alicuota?: number;
}

export interface CreateTaxDocumentInput extends TaxAmountsInput {
  tipo: TaxDocTipo;
  fecha: string;
  periodo?: string;              // por defecto, el mes de `fecha`
  nit?: string | null;
  razon_social: string;
  tipo_documento?: TaxTipoDocumento;
  numero_factura?: string | null;
  numero_autorizacion?: string | null;
  codigo_control?: string | null;
  con_derecho_credito?: boolean;
  sale_id?: string | null;
  payable_id?: string | null;
  journal_entry_id?: string | null;
  notas?: string | null;
}

export type UpdateTaxDocumentInput = Partial<Omit<CreateTaxDocumentInput, 'tipo'>>;

/** Totales de un libro (compras o ventas) para un período. */
export interface LibroTotales {
  documentos: number;
  importe_total: number;
  base_imponible: number;
  /** Crédito fiscal (compras) o débito fiscal (ventas). */
  iva: number;
  /** Solo compras: IVA de facturas marcadas sin derecho a crédito fiscal. */
  iva_sin_derecho: number;
}

/** Candidata a importar al Libro de Ventas (venta con factura aún no registrada). */
export interface VentaPendienteFiscal {
  id: string;
  numero: string;
  fecha: string;
  cliente_nombre: string | null;
  total_cobrado: number;
  total_iva: number;
  journal_entry_id: string | null;
}

/** Candidata a importar al Libro de Compras (CxP aún no registrada ni descartada). */
export interface CxPPendienteFiscal {
  id: string;
  numero_documento: string;
  fecha_emision: string;
  proveedor_nombre: string;
  proveedor_nit: string | null;
  monto_original: number;
  moneda: string;
  journal_entry_id: string | null;
}
