// src/accounting/shipment-types.ts
// Tipos para el módulo de Embarques (importaciones)

// Referencia a un archivo subido a Supabase Storage
export interface ShipmentFile {
  id: string;
  name: string;           // Nombre original del archivo
  path: string;           // Ruta en storage (para descargar/eliminar)
  size?: number;          // Bytes
  uploaded_at: string;    // ISO date
}

export type ShipmentStatus =
  | 'EN_COMPRA'      // Acumulando compras, antes de enviar
  | 'FLETE_PAGADO'   // Flete pagado, en camino
  | 'EN_ADUANA'      // Llegó, en trámite aduanero
  | 'EN_ALMACEN'     // Llegó al almacén, calculando costos finales
  | 'CERRADO';       // Asientos generados, Kárdex actualizado

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  EN_COMPRA:    'En Compra',
  FLETE_PAGADO: 'Flete Pagado',
  EN_ADUANA:    'En Aduana',
  EN_ALMACEN:   'En Almacén',
  CERRADO:      'Cerrado',
};

export const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, string> = {
  EN_COMPRA:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  FLETE_PAGADO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  EN_ADUANA:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  EN_ALMACEN:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  CERRADO:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

// Categoría contable del producto — ahora es string para soportar categorías dinámicas
export type ProductCategory = string;

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  electronica: 'Electrónica / Tecnología',
  juguetes:    'Juguetes',
  repuestos:   'Repuestos',
  otros:       'Otros',
};

// Un producto dentro de un embarque
export interface ShipmentProduct {
  archivos?: ShipmentFile[];      // Facturas u otros documentos del producto
  especificacion?: string;        // Variante corta (ej: "256GB / WiFi + Chip")
  id: string;
  shipment_id: string;

  // Datos del producto
  nombre: string;
  categoria: ProductCategory;
  cantidad: number;
  precio_usd: number;            // Precio unitario en USD
  precio_usd_total?: number;     // Total pagado en USD por toda la cantidad (fuente de verdad cuando existe)
  tax_pct: number;               // Tax del proveedor (ej: 7 para 7%), 0 si no aplica
  fecha_compra: string;          // ISO date — puede variar por producto
  tiene_bateria: boolean;
  costo_bateria: number;         // En Bs, solo si tiene_bateria = true

  // Precio pagado en Bs (para calcular T/C real por producto)
  precio_bs_pagado?: number;       // Precio unitario pagado en Bs
  precio_bs_pagado_total?: number; // Total pagado en Bs por toda la cantidad (fuente de verdad cuando existe)
  tc_producto?: number;            // T/C calculado

  // Dimensiones (se ingresan cuando llega al almacén)
  m1?: number;              // cm
  m2?: number;              // cm
  m3?: number;              // cm
  peso_bruto?: number;      // kg real

  // Tributos aduaneros (del DIM — se ingresan en estado EN_ADUANA)
  ga_pct: number;           // % gravamen arancelario (10, 15, 20...)
  ga_monto?: number;        // Monto exacto del DIM en Bs
  iva_monto?: number;       // Monto exacto del DIM en Bs

  // Costos calculados (se calculan al cerrar)
  peso_volumen?: number;
  costo_envio_unitario?: number;
  costo_manipuleo_unitario?: number;
  costo_total_unitario?: number;   // Costo real final por unidad
}

// Gastos de aduana registrados (manipuleo)
export interface ShipmentExpense {
  id: string;
  shipment_id: string;
  concepto: string;         // "Almacenaje", "Examen Previo", "SUMA", "Agencia despachante"
  monto: number;            // En Bs
  fecha: string;
  archivos?: ShipmentFile[];
}

// El embarque en sí
export interface Shipment {
  id: string;
  numero: string;           // Ej: "EMB-2025-001"
  descripcion?: string;
  status: ShipmentStatus;
  created_at: string;

  // Tipo de cambio (del embarque)
  tc_paralelo: number;      // T/C paralelo (varía por compra, pero se guarda el promedio o el del día)
  tc_oficial: number;       // Siempre 6.97 en Bolivia

  // Flete (se registra en estado FLETE_PAGADO)
  flete_total_bs?: number;          // Total pagado de flete en Bs
  flete_fecha?: string;
  flete_journal_entry_id?: string;  // Referencia al asiento del Libro Diario

  // Método de peso para prorrateo de flete y manipuleo
  metodo_peso?: 'automatico' | 'peso_volumen' | 'peso_bruto';
  // 'automatico' (default) = el mayor entre volumen y bruto (criterio courier)
  // 'peso_volumen'          = usa solo el peso volumen calculado
  // 'peso_bruto'            = usa solo el peso bruto ingresado

  // Tarifa de manipuleo por kg (varía por importación)
  tarifa_manipuleo_por_kg: number;  // Ej: 25

  // Gastos de aduana (estado EN_ADUANA)
  gastos_aduana: ShipmentExpense[];

  // Productos
  products: ShipmentProduct[];

  // Categorías personalizadas del embarque
  custom_categories?: Record<string, string>;

  // Documentos adjuntos del embarque
  flete_archivos?: ShipmentFile[];   // Documentos del flete aéreo
  dim_archivos?: ShipmentFile[];     // DIM y documentos aduaneros

  // Asientos generados al cerrar
  journal_entry_ids?: string[];
}
