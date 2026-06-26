// src/accounting/investment-types.ts
// Tipos del módulo de Análisis de Inversión / Evaluación de Importaciones.
// Herramienta de simulación gerencial: NO toca contabilidad ni inventario.

export type InvestmentEstado = 'BORRADOR' | 'APROBADO' | 'DESCARTADO' | 'EJECUTADO';

export const INVESTMENT_ESTADO_LABELS: Record<InvestmentEstado, string> = {
  BORRADOR:   'Borrador',
  APROBADO:   'Aprobado',
  DESCARTADO: 'Descartado',
  EJECUTADO:  'Ejecutado',
};

export const INVESTMENT_ESTADO_COLORS: Record<InvestmentEstado, string> = {
  BORRADOR:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  APROBADO:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  DESCARTADO: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  EJECUTADO:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

// ─── Producto del análisis ──────────────────────────────────────────────────
// Comparte los campos de costeo del cotizador de licitaciones y agrega la
// dimensión de venta/tiempo (precio_venta, velocidad_venta).
export interface InvestmentItem {
  id: string;
  analysis_id: string;
  orden: number;

  // Descripción
  nombre: string;
  especificacion?: string;
  link_producto?: string;
  hs_code?: string;

  // Cantidad y tipo de cambio
  cantidad: number;
  tc: number;
  tc_envio?: number;
  tc_oficial?: number;     // T/C para tributos aduaneros (GA + IVA). undefined = hereda el del análisis (→ TC_OFICIAL)

  // Compra
  precio_usd: number;
  tax_pct: number;

  // Dimensiones / peso para flete
  m1?: number;
  m2?: number;
  m3?: number;
  peso_bruto?: number;
  usa_peso_bruto: boolean;
  tarifa_envio: number;
  tarifa_manipuleo: number;

  // Tributos aduaneros
  ga_pct: number;
  ga_manual?: number;
  usa_ga_manual: boolean;
  iva_aduana_manual?: number;
  usa_iva_manual: boolean;

  // Batería
  tiene_bateria: boolean;
  costo_bateria: number;

  // Venta esperada — driver de la rentabilidad
  modalidad_venta: 'con_factura' | 'sin_factura'; // qué precio maneja el análisis
  precio_venta: number;             // Bs/unidad CON factura
  precio_venta_sin_factura: number; // Bs/unidad SIN factura (normalmente menor)
  cantidad_sin_factura: number;     // (obsoleto, sin uso) — se mantiene por compatibilidad de BD

  // Costos adicionales
  garantia: number;
  pasaje: number;
  envio_local: number;
  otros_costos: number;

  // Dimensión temporal de venta
  velocidad_venta: number;        // unidades/mes estimadas
  meses_venta_override?: number;  // si se fija el plazo de venta manualmente (meses)

  // Conciliación con embarque: IDs de las filas del embarque vinculado que
  // corresponden a este producto del análisis (uno-a-varios).
  mapped_shipment_product_ids: string[];

  created_at?: string;
  updated_at?: string;
}

// ─── Cabecera del análisis ──────────────────────────────────────────────────
export interface InvestmentAnalysis {
  id: string;
  company_id: string;
  user_id?: string;

  nombre: string;
  notas?: string;

  // Parámetros financieros
  costo_capital_anual: number;       // % anual — tasa de descuento para VAN/TIR
  plazo_importacion_meses: number;   // meses desde el pago hasta la mercadería en almacén
  fuc_pct: number;                   // Factor de Utilización de Capital (% ) — tiempo activo / total
  tc_oficial?: number;               // T/C para tributos aduaneros (GA + IVA) por defecto. undefined = TC_OFICIAL (6.97)

  estado: InvestmentEstado;
  embarque_id?: string;              // set cuando se "envía a embarque"

  items: InvestmentItem[];

  created_at: string;
  updated_at: string;
}

// ─── Resultados calculados (solo frontend, nunca persistidos) ───────────────

// Costeo + rentabilidad estática de un ítem (reusa la lógica de licitaciones).
export interface ItemCosteo {
  // Costos unitarios de importación
  precio_bs: number;
  precio_bob: number;
  peso_vol: number;
  peso: number;
  envio: number;
  ga_calculado: number;
  ga: number;
  iva_aduana_calculado: number;
  iva_aduana: number;
  impuestos: number;
  manipuleo: number;
  bateria: number;
  costo_unitario: number;      // costo importación por unidad CON IVA aduana (total_individual)
  costo_unitario_sin_iva: number; // costo contable del inventario (sin IVA — = costo real del embarque/COGS)

  // Totales por cantidad
  inversion: number;           // costo_unitario × cantidad + extras (capital comprometido)
  ingreso_total: number;       // ingreso con factura + sin factura
  ingreso_con_factura: number; // precio_venta × unidades con factura
  ingreso_sin_factura: number; // precio_venta_sin_factura × unidades sin factura
  cantidad_con_factura: number;
  cantidad_sin_factura: number;
  iva_pagar: number;           // solo sobre ventas con factura (13% − crédito IVA aduana)
  it_pagar: number;            // solo sobre ventas con factura (3%)
  costos: number;              // costo total con impuestos de venta + extras
  ganancia: number;            // ingreso_total − costos
  roi: number;                 // ganancia / inversión

  // Precios mínimos para no perder
  precio_piso: number;         // unidad CON factura
  precio_piso_sf: number;      // unidad SIN factura (= costo unitario, sin impuestos)

  // Precio CON factura que iguala la ganancia/unidad a la venta SIN factura
  // = (precio_sin_factura − iva_aduana) / (1 − IVA − IT). 0 si no hay precio s/f.
  precio_con_factura_sugerido: number;

  extras: number;              // garantia + pasaje + envio_local + otros_costos
}

// Análisis temporal (lo gerencial): ciclo de caja, retornos en el tiempo, VAN/TIR.
export interface ItemTiempo {
  meses_venta: number;         // tiempo estimado para vender todo el lote
  ciclo_meses: number;         // plazo_importacion + meses_venta (capital atrapado)
  roi_mensual: number;         // ROI repartido linealmente en el ciclo
  roi_anualizado: number;          // TEÓRICO: (1+ROI)^(12/ciclo) − 1 (reinversión sin fricción)
  roi_anualizado_realista: number; // REALISTA: (1+ROI)^((12×FUC)/ciclo) − 1 (descuenta tiempo muerto)
  punto_equilibrio_uds: number; // unidades a vender para recuperar la inversión
  meses_recuperacion: number;  // cuándo se recupera la inversión según velocidad de venta
  van: number;                 // Valor Actual Neto del flujo mensual
  tir_mensual: number;         // Tasa Interna de Retorno mensual
  tir_anual: number;           // TIR anualizada
  flujos: number[];            // flujo de caja mensual (mes 0 = −inversión)
}

export interface ItemCalc {
  costeo: ItemCosteo;
  tiempo: ItemTiempo;
}

// Resumen agregado del análisis completo.
export interface InvestmentResumen {
  inversion: number;
  ingreso_total: number;
  costos: number;
  ganancia: number;
  roi: number;
  ciclo_meses: number;         // ciclo ponderado por inversión
  roi_anualizado: number;          // teórico
  roi_anualizado_realista: number; // con FUC
  van: number;
  tir_anual: number;
}
