// src/accounting/licitacion-types.ts
// Tipos para el módulo de Licitaciones

// ─── Enums / constantes ────────────────────────────────────────────────────────

export type LicitacionEstado =
  | 'BORRADOR'
  | 'PRESENTADA'
  | 'ADJUDICADA'
  | 'PERDIDA'
  | 'DESIERTA'
  | 'ENTREGADA'
  | 'COBRADA';

export type TipoProceso = 'ANPE' | 'ANPP' | 'CM' | 'LP' | 'CD' | 'OTRO';

export type DocCategoria =
  | 'DBC'
  | 'FORMULARIOS'
  | 'ADJUDICACION'
  | 'SOLICITUD_DOCUMENTOS'
  | 'DOCUMENTOS_EMPRESA'
  | 'CONTRATO'
  | 'DOCUMENTOS_ADICIONALES'
  | 'NOTAS_ENTREGA'
  | 'ACTA_RECEPCION'
  | 'COTIZACION_EXCEL'
  | 'OTROS';

export const LICITACION_ESTADO_LABELS: Record<LicitacionEstado, string> = {
  BORRADOR:   'Borrador',
  PRESENTADA: 'Presentada',
  ADJUDICADA: 'Adjudicada',
  PERDIDA:    'Perdida',
  DESIERTA:   'Desierta',
  ENTREGADA:  'Entregada',
  COBRADA:    'Cobrada',
};

export const LICITACION_ESTADO_COLORS: Record<LicitacionEstado, string> = {
  BORRADOR:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PRESENTADA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ADJUDICADA: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  PERDIDA:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  DESIERTA:   'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  ENTREGADA:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  COBRADA:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export const TIPO_PROCESO_LABELS: Record<TipoProceso, string> = {
  ANPE: 'ANPE',
  ANPP: 'ANPP',
  CM:   'Contratación Menor (CM)',
  LP:   'Licitación Pública (LP)',
  CD:   'Contratación Directa (CD)',
  OTRO: 'Otro',
};

export const DOC_CATEGORIA_LABELS: Record<DocCategoria, string> = {
  DBC:                  'DBC',
  FORMULARIOS:          'Formularios',
  ADJUDICACION:         'Adjudicación',
  SOLICITUD_DOCUMENTOS: 'Solicitud de Documentos',
  DOCUMENTOS_EMPRESA:   'Documentos de Empresa',
  CONTRATO:             'Contrato / Orden de Compra',
  DOCUMENTOS_ADICIONALES: 'Documentos Adicionales',
  NOTAS_ENTREGA:        'Notas de Entrega',
  ACTA_RECEPCION:       'Acta de Recepción',
  COTIZACION_EXCEL:     'Cotización (Excel)',
  OTROS:                'Otros',
};

// Orden visual de categorías en la pestaña de documentos
export const DOC_CATEGORIAS_ORDEN: DocCategoria[] = [
  'DBC',
  'FORMULARIOS',
  'ADJUDICACION',
  'SOLICITUD_DOCUMENTOS',
  'DOCUMENTOS_EMPRESA',
  'CONTRATO',
  'DOCUMENTOS_ADICIONALES',
  'NOTAS_ENTREGA',
  'ACTA_RECEPCION',
  'COTIZACION_EXCEL',
  'OTROS',
];

// ─── Entidades ─────────────────────────────────────────────────────────────────

export interface LicitacionDoc {
  id: string;
  licitacion_id: string;
  categoria: DocCategoria;
  nombre: string;          // nombre original del archivo
  path: string;            // path en Supabase Storage
  size?: number;           // bytes
  descripcion?: string;
  uploaded_by?: string;
  uploaded_at: string;     // ISO date
}

export interface LicitacionProducto {
  id: string;
  licitacion_id: string;
  orden: number;

  // Descripción
  nombre: string;
  especificacion?: string;
  link_producto?: string;
  hs_code?: string;

  // Cantidad y tipo de cambio
  cantidad: number;
  tc: number;              // T/C paralelo (compra del producto)
  tc_envio?: number;       // T/C al momento del flete (puede diferir)
  tc_oficial?: number;     // T/C para tributos aduaneros (GA + IVA). undefined = hereda el de la cotización (→ TC_OFICIAL)

  // Precio de compra
  precio_usd: number;
  tax_pct: number;         // % tax del proveedor

  // Dimensiones para flete (cm)
  m1?: number;
  m2?: number;
  m3?: number;

  // Peso bruto (alternativa al volumétrico para el cálculo de flete)
  peso_bruto?: number;      // kg — ingresado manualmente
  usa_peso_bruto: boolean;  // true = usar peso_bruto; false = usar peso volumétrico

  // Tarifas (varían por importación)
  tarifa_envio: number;    // USD/kg tarifa aérea
  tarifa_manipuleo: number; // Bs/kg manipuleo

  // Tributos aduaneros
  ga_pct: number;           // % gravamen arancelario (ej: 5)
  ga_manual?: number;       // GA en Bs/unidad (override manual del calculado)
  usa_ga_manual: boolean;   // true = usar ga_manual

  // Override de IVA aduana
  iva_aduana_manual?: number;  // IVA aduana en Bs/unidad (override manual)
  usa_iva_manual: boolean;     // true = usar iva_aduana_manual

  // Batería
  tiene_bateria: boolean;
  costo_bateria: number;

  // Precio referencial ofertado por la entidad (Bs/unidad) — solo referencia, no entra al cálculo
  precio_entidad?: number;

  // Precio ofertado — el usuario lo define; conduce el recálculo
  precio_ofertado: number;

  // Costos adicionales de la licitación
  garantia: number;
  pasaje: number;
  envio_local: number;
  otros_costos: number;

  // Metadato
  fuente: 'manual' | 'ia';

  created_at?: string;
  updated_at?: string;
}

export interface Licitacion {
  id: string;
  company_id: string;
  user_id: string;

  // Identificación
  nombre: string;
  entidad: string;
  numero_sicoes: string;
  tipo_proceso: TipoProceso;

  // Financiero
  precio_referencial?: number;

  // T/C para tributos aduaneros (GA + IVA) por defecto de toda la cotización.
  // Cada producto puede sobreescribirlo. undefined = usar TC_OFICIAL (6.97).
  tc_oficial?: number;

  // Estado
  estado: LicitacionEstado;

  // Fechas
  fecha_presentacion?: string;
  fecha_adjudicacion_est?: string;
  fecha_contrato?: string;
  plazo_entrega_dias?: number;
  fecha_limite_entrega?: string;
  fecha_entrega_real?: string;
  fecha_cobro?: string;

  // Vínculo opcional a embarque
  embarque_id?: string;

  // Notas libres
  notas?: string;

  // Datos extraídos por IA (uso futuro)
  datos_ia: Record<string, unknown>;

  // Relaciones cargadas por separado
  productos: LicitacionProducto[];
  documentos: LicitacionDoc[];

  created_at: string;
  updated_at: string;
}

// ─── Valores calculados (solo frontend, nunca persistidos) ─────────────────────

export interface ProductoCalc {
  // Costos unitarios de importación
  precio_bs: number;           // (precio_usd + tax) × tc
  precio_bob: number;          // precio_usd × 6.97 (para tributos aduaneros)
  peso_vol: number;            // (m1×m2×m3) / 5000 — siempre calculado para referencia
  peso: number;                // peso efectivo usado (volumétrico o bruto)
  envio: number;               // peso × tarifa_envio × tc_envio
  ga_calculado: number;        // GA auto-calculado (para mostrar como referencia al usar override)
  ga: number;                  // GA efectivo (calculado o manual)
  iva_aduana_calculado: number; // IVA aduana auto-calculado (para referencia)
  iva_aduana: number;          // IVA aduana efectivo (calculado o manual)
  impuestos: number;           // ga + iva_aduana
  manipuleo: number;           // peso × tarifa_manipuleo
  bateria: number;             // costo_bateria si tiene_bateria, si no 0
  total_individual: number;    // costo importación por unidad

  // Totales por cantidad
  total_import: number;        // total_individual × cantidad
  total_ofertado: number;      // precio_ofertado × cantidad

  // Costos licitación
  iva_pagar: number;           // total_ofertado×13% − iva_aduana×cantidad  (crédito fiscal)
  it_pagar: number;            // total_ofertado × 3%
  costos: number;              // total_import + iva_pagar + it_pagar + extras
  ganancia: number;            // total_ofertado − costos
  roi: number;                 // ganancia / costos

  // Precio mínimo para ganar (ganancia = 0)
  precio_piso: number;         // unitario, algebraicamente derivado
}

export interface LicitacionResumen {
  total_import: number;
  total_ofertado: number;
  precio_piso_total: number;   // Σ (precio_piso × cantidad) — oferta mínima total para no perder
  iva_pagar: number;
  it_pagar: number;
  costos: number;
  ganancia: number;
  roi: number;
}
