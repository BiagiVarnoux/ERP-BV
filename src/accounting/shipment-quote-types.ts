// src/accounting/shipment-quote-types.ts
// Cotizaciones/proformas de cliente generadas desde un embarque cerrado.

import { round2 } from './utils';

export interface CotizacionConcepto {
  id: string;
  nombre: string;
  incluido: boolean;
  valor_unitario: number;
  /** true si lo agregó el usuario a mano (ej. "Ganancia") — permite borrarlo. Los 5 estándar no. */
  personalizado?: boolean;
}

export interface CotizacionProducto {
  id: string;
  shipment_product_id: string;
  nombre: string;
  especificacion?: string;
  cantidad: number;
  conceptos: CotizacionConcepto[];
}

export interface ShipmentQuote {
  id: string;
  shipment_id: string;
  numero: string;
  cliente_nombre?: string;
  fecha: string; // ISO date
  productos: CotizacionProducto[];
  total_general: number;
  created_at: string;
}

/** Subtotal de un producto: cantidad × suma de los conceptos incluidos. */
export function calcSubtotalProducto(p: Pick<CotizacionProducto, 'cantidad' | 'conceptos'>): number {
  const sumaUnitaria = p.conceptos.filter(c => c.incluido).reduce((s, c) => s + c.valor_unitario, 0);
  return round2(p.cantidad * sumaUnitaria);
}

/** Total general de una cotización: suma de subtotales de sus productos. */
export function calcTotalGeneral(productos: Array<Pick<CotizacionProducto, 'cantidad' | 'conceptos'>>): number {
  return round2(productos.reduce((s, p) => s + calcSubtotalProducto(p), 0));
}
