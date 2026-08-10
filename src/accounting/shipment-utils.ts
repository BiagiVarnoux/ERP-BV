// src/accounting/shipment-utils.ts
// Fórmulas exactas del Excel de importaciones

import { round2, round6 } from './utils';
import { ShipmentProduct, Shipment, ShipmentExpense, DEFAULT_CATEGORY_LABELS } from './shipment-types';

// ─── Categorías dinámicas ─────────────────────────────────────────────────────

const CUSTOM_CATEGORIES_KEY = 'shipment_custom_categories_v1';

export function loadCustomCategories(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCustomCategory(slug: string, label: string): void {
  const current = loadCustomCategories();
  current[slug] = label;
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(current));
}

export function getAllCategories(): Record<string, string> {
  return { ...DEFAULT_CATEGORY_LABELS, ...loadCustomCategories() };
}

// ─── Helper: precio unitario USD efectivo ────────────────────────────────────
/** Devuelve el precio unitario USD real: prioriza total/cantidad sobre el unitario directo */
function precioUsdEfectivo(p: ShipmentProduct): number {
  if (p.precio_usd_total != null && p.precio_usd_total > 0) {
    return p.precio_usd_total / p.cantidad;
  }
  return p.precio_usd;
}

// ─── Fórmulas por producto ────────────────────────────────────────────────────

/** Precio unitario en Bs: prioriza total pagado > unitario pagado > usd × tc */
export function calcPrecioBs(p: ShipmentProduct, tc_paralelo: number): number {
  // Prioridad 1: total pagado en Bs — fuente de verdad exacta cuando el usuario ingresó el total
  if (p.precio_bs_pagado_total != null && p.precio_bs_pagado_total > 0) {
    return round2(p.precio_bs_pagado_total / p.cantidad);
  }
  // Prioridad 2: precio unitario pagado en Bs — evita error de redondeo del T/C
  if (p.precio_bs_pagado != null && p.precio_bs_pagado > 0) {
    return round2(p.precio_bs_pagado);
  }
  // Fallback: precio_usd × T/C (usa total USD si existe para mayor precisión)
  const tc = p.tc_producto ?? tc_paralelo;
  const usd = precioUsdEfectivo(p);
  return round2(usd * (1 + p.tax_pct / 100) * tc);
}

/**
 * Total exacto en Bs del costo de adquisición para TODAS las unidades del producto.
 * Usa los campos "total" cuando existen, evitando el error de round2(total/n)×n ≠ total.
 * Solo para mostrar totales en UI — los costos unitarios del Kárdex siguen usando calcPrecioBs.
 */
export function calcTotalBsProducto(p: ShipmentProduct, tc_paralelo: number): number {
  if (p.precio_bs_pagado_total != null && p.precio_bs_pagado_total > 0) {
    return p.precio_bs_pagado_total; // exacto — sin round2
  }
  if (p.precio_bs_pagado != null && p.precio_bs_pagado > 0) {
    return round2(p.precio_bs_pagado * p.cantidad);
  }
  const tc = p.tc_producto ?? tc_paralelo;
  const usdTotal = p.precio_usd_total ?? (p.precio_usd * p.cantidad);
  return round2(usdTotal * (1 + p.tax_pct / 100) * tc);
}

/** Precio BOB unitario (para tributos): usa total USD cuando existe para mayor precisión */
export function calcPrecioBOB(p: ShipmentProduct, tc_oficial: number): number {
  return round2(precioUsdEfectivo(p) * tc_oficial);
}

/** Peso volumen: (M1 × M2 × M3) / 5000 */
export function calcPesoVolumen(p: ShipmentProduct): number | undefined {
  if (!p.m1 || !p.m2 || !p.m3) return undefined;
  return round2((p.m1 * p.m2 * p.m3) / 5000);
}

/** Peso efectivo automático: el mayor entre peso volumen y peso bruto (criterio courier) */
export function calcPesoEfectivo(p: ShipmentProduct): number | undefined {
  const pv = calcPesoVolumen(p);
  if (!pv && !p.peso_bruto) return undefined;
  if (!pv) return p.peso_bruto;
  if (!p.peso_bruto) return pv;
  return Math.max(pv, p.peso_bruto);
}

/** Peso efectivo según el método seleccionado en el embarque */
export function getPesoEfectivoPorMetodo(
  p: ShipmentProduct,
  metodo: 'automatico' | 'peso_volumen' | 'peso_bruto' = 'automatico'
): number | undefined {
  if (metodo === 'peso_volumen') return calcPesoVolumen(p);
  if (metodo === 'peso_bruto')   return p.peso_bruto;
  return calcPesoEfectivo(p); // automatico = Math.max
}

/**
 * Envío por unidad: peso_efectivo × tarifa_flete_por_kg × tc_paralelo
 */
export function calcEnvioUnitario(
  p: ShipmentProduct,
  tc_paralelo: number,
  tarifa_usd_por_kg: number = 11,
  metodo: 'automatico' | 'peso_volumen' | 'peso_bruto' = 'automatico'
): number | undefined {
  const peso = getPesoEfectivoPorMetodo(p, metodo);
  if (!peso) return undefined;
  return round2(peso * tarifa_usd_por_kg * tc_paralelo);
}

/**
 * GA estimado: (precio_BOB + envio + precio_BOB*0.02) × (ga_pct/100)
 */
export function calcGAEstimado(
  p: ShipmentProduct,
  tc_oficial: number,
  envioUnitario: number
): number {
  const precioBOB = calcPrecioBOB(p, tc_oficial);
  const base = precioBOB + envioUnitario + precioBOB * 0.02;
  return round2(base * (p.ga_pct / 100));
}

/**
 * IVA estimado: (precio_BOB + GA) × 14.94%
 */
export function calcIVAEstimado(
  p: ShipmentProduct,
  tc_oficial: number,
  ga: number
): number {
  const precioBOB = calcPrecioBOB(p, tc_oficial);
  return round2((precioBOB + ga) * 0.1494);
}

/** Total de impuestos estimados: GA + IVA */
export function calcImpuestosEstimados(ga: number, iva: number): number {
  return round2(ga + iva);
}

/**
 * Costo total estimado por unidad:
 * precio_bs + envio + impuestos + manipuleo + bateria
 */
export function calcTotalIndividualEstimado(
  precioBs: number,
  envio: number,
  impuestos: number,
  manipuleo: number,
  bateria: number
): number {
  return round2(precioBs + envio + impuestos + manipuleo + bateria);
}

// ─── Prorrateo al cerrar el embarque ──────────────────────────────────────────

export function calcPesoTotalEmbarque(
  products: ShipmentProduct[],
  metodo: 'automatico' | 'peso_volumen' | 'peso_bruto' = 'automatico'
): number {
  return round2(
    products.reduce((sum, p) => {
      // El peso ingresado (bruto o volumen) es el del PAQUETE COMPLETO para todas las
      // unidades de ese producto — NO se multiplica por cantidad.
      // La división por cantidad se hace en calcFleteProrrateado/calcManipuleoProrrateado
      // al asignar el costo unitario.
      const peso = getPesoEfectivoPorMetodo(p, metodo) ?? 0;
      return sum + peso;
    }, 0)
  );
}

export function calcFleteProrrateado(
  products: ShipmentProduct[],
  flete_total_bs: number,
  metodo: 'automatico' | 'peso_volumen' | 'peso_bruto' = 'automatico'
): Record<string, number> {
  const pesoTotal = calcPesoTotalEmbarque(products, metodo);
  const result: Record<string, number> = {};
  if (pesoTotal === 0) return result;
  products.forEach(p => {
    const peso = getPesoEfectivoPorMetodo(p, metodo) ?? 0;
    const participacion = peso / pesoTotal;
    const fleteDelPaquete = flete_total_bs * participacion; // sin round2 — mantener precisión
    result[p.id] = round6(fleteDelPaquete / p.cantidad);   // 6 decimales para el unitario
  });
  return result;
}

/**
 * Manipuleo en aduana prorrateado por peso, usando el mismo método configurado
 * en la pestaña Medidas del embarque (automático / peso volumen / peso bruto).
 */
export function calcManipuleoProrrateado(
  products: ShipmentProduct[],
  gastos_aduana: ShipmentExpense[],
  metodo: 'automatico' | 'peso_volumen' | 'peso_bruto' = 'automatico'
): Record<string, number> {
  const totalManipuleo = gastos_aduana.reduce((s, g) => s + g.monto, 0);
  const pesoTotal = calcPesoTotalEmbarque(products, metodo);
  const result: Record<string, number> = {};
  if (pesoTotal === 0 || totalManipuleo === 0) return result;
  products.forEach(p => {
    const peso = getPesoEfectivoPorMetodo(p, metodo) ?? 0;
    const participacion = peso / pesoTotal;
    const manipuleoDelPaquete = totalManipuleo * participacion;
    result[p.id] = round6(manipuleoDelPaquete / p.cantidad);
  });
  return result;
}

export function calcCostoFinalPorProducto(
  shipment: Shipment
): Array<{ product: ShipmentProduct; costo_unitario: number; precioBsTotal: number; detalle: CostoDetalle }> {
  const { products, tc_paralelo, tc_oficial, flete_total_bs = 0, gastos_aduana } = shipment;
  const metodo = shipment.metodo_peso ?? 'automatico';
  const fleteMap = calcFleteProrrateado(products, flete_total_bs, metodo);
  const manipuleoMap = calcManipuleoProrrateado(products, gastos_aduana, metodo);

  return products.map(p => {
    // precioBs unitario — con 6 decimales si viene de dividir un total
    const precioBsTotal = calcTotalBsProducto(p, tc_paralelo); // total exacto del paquete
    const precioBs = round6(precioBsTotal / p.cantidad);       // unitario con 6 decimales
    const envioUnitario = fleteMap[p.id] ?? 0;                 // ya tiene 6 decimales

    // GA y manipuleo unitarios — sin round2 para no perder precisión
    const ga = p.ga_monto != null
      ? p.ga_monto / p.cantidad
      : calcGAEstimado(p, tc_oficial, envioUnitario);
    const iva = p.iva_monto != null
      ? p.iva_monto / p.cantidad
      : calcIVAEstimado(p, tc_oficial, ga);
    const manipuleo = manipuleoMap[p.id] ?? 0;
    const bateria = p.tiene_bateria ? p.costo_bateria : 0;

    // IVA NO suma al costo — es Crédito Fiscal, solo aparece como info
    const impuestos = ga;
    // costo_unitario con 6 decimales — se guarda así en inventory_lots
    const costo_unitario = round6(precioBs + envioUnitario + impuestos + manipuleo + bateria);

    // Para el detalle de pantalla, usamos round2 solo al mostrar
    return {
      product: p,
      costo_unitario,                           // 6 decimales — va a DB
      precioBsTotal,                            // total exacto — para el asiento
      detalle: {
        precioBs: round2(precioBs),             // 2 dec — solo para mostrar
        envioUnitario: round2(envioUnitario),
        ga: round2(ga),
        iva: round2(iva),
        impuestos: round2(impuestos),
        manipuleo: round2(manipuleo),
        bateria,
      },
    };
  });
}

export interface CostoDetalle {
  precioBs: number;      // unitario redondeado a 2 dec — solo para mostrar
  envioUnitario: number;
  ga: number;
  iva: number;
  impuestos: number;
  manipuleo: number;
  bateria: number;
}

// ─── Desglose TOTAL por producto (reconciliado) ────────────────────────────────
// El detalle por unidad, al redondearse a 2 decimales y multiplicarse por
// cantidad, acumula un pequeño desfase (la suma no cuadra con lo pagado). Este
// helper devuelve el TOTAL por producto de cada componente, ajustando el
// residuo de redondeo del flete y el manipuleo al producto de mayor peso — así
// la suma de cada columna cuadra exacto con lo realmente pagado. GA e IVA usan
// los montos por producto (ga_monto/iva_monto), que ya son exactos.

export interface DesgloseTotalProducto {
  product: ShipmentProduct;
  precioBsTotal: number;
  fleteTotal: number;
  gaTotal: number;
  ivaTotal: number;
  manipuleoTotal: number;
  bateriaTotal: number;
  costoSinIvaTotal: number;
  costoConIvaTotal: number;
}

export interface DesgloseTotales {
  precioBs: number; flete: number; ga: number; iva: number;
  manipuleo: number; bateria: number; costoSinIva: number; costoConIva: number;
}

/** Reparte `total` entre productos según su valor exacto, redondea a 2 dec y
 *  ajusta el residuo al producto de mayor valor, para que Σ = total. */
function repartirReconciliado(
  products: ShipmentProduct[],
  exacto: Record<string, number>,
  total: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  let suma = 0;
  for (const p of products) { out[p.id] = round2(exacto[p.id] || 0); suma = round2(suma + out[p.id]); }
  const residuo = round2(total - suma);
  if (Math.abs(residuo) >= 0.01 && products.length > 0) {
    const mayor = products.reduce((a, b) => (exacto[b.id] || 0) > (exacto[a.id] || 0) ? b : a);
    out[mayor.id] = round2(out[mayor.id] + residuo);
  }
  return out;
}

export function calcDesgloseReconciliado(shipment: Shipment): {
  filas: DesgloseTotalProducto[];
  totales: DesgloseTotales;
} {
  const { products, tc_paralelo, tc_oficial, flete_total_bs = 0, gastos_aduana } = shipment;
  const metodo = shipment.metodo_peso ?? 'automatico';
  const pesoTotal = calcPesoTotalEmbarque(products, metodo);
  const totalManipuleo = round2(gastos_aduana.reduce((s, g) => s + g.monto, 0));

  const fleteExacto: Record<string, number> = {};
  const manipExacto: Record<string, number> = {};
  for (const p of products) {
    const peso = getPesoEfectivoPorMetodo(p, metodo) ?? 0;
    const part = pesoTotal > 0 ? peso / pesoTotal : 0;
    fleteExacto[p.id] = (flete_total_bs || 0) * part;
    manipExacto[p.id] = totalManipuleo * part;
  }
  const fleteMap = repartirReconciliado(products, fleteExacto, flete_total_bs || 0);
  const manipMap = repartirReconciliado(products, manipExacto, totalManipuleo);

  const filas: DesgloseTotalProducto[] = products.map(p => {
    const cantidad = p.cantidad || 1;
    const precioBsTotal   = round2(calcTotalBsProducto(p, tc_paralelo));
    const fleteTotal      = fleteMap[p.id] ?? 0;
    const manipuleoTotal  = manipMap[p.id] ?? 0;
    const gaTotal = p.ga_monto != null
      ? round2(p.ga_monto)
      : round2(calcGAEstimado(p, tc_oficial, (fleteTotal / cantidad)) * cantidad);
    const ivaTotal = p.iva_monto != null
      ? round2(p.iva_monto)
      : round2(calcIVAEstimado(p, tc_oficial, gaTotal / cantidad) * cantidad);
    const bateriaTotal = round2((p.tiene_bateria ? p.costo_bateria : 0) * cantidad);
    const costoSinIvaTotal = round2(precioBsTotal + fleteTotal + gaTotal + manipuleoTotal + bateriaTotal);
    const costoConIvaTotal = round2(costoSinIvaTotal + ivaTotal);
    return { product: p, precioBsTotal, fleteTotal, gaTotal, ivaTotal, manipuleoTotal, bateriaTotal, costoSinIvaTotal, costoConIvaTotal };
  });

  const sum = (f: (x: DesgloseTotalProducto) => number) => round2(filas.reduce((s, x) => s + f(x), 0));
  const totales: DesgloseTotales = {
    precioBs:    sum(x => x.precioBsTotal),
    flete:       sum(x => x.fleteTotal),
    ga:          sum(x => x.gaTotal),
    iva:         sum(x => x.ivaTotal),
    manipuleo:   sum(x => x.manipuleoTotal),
    bateria:     sum(x => x.bateriaTotal),
    costoSinIva: sum(x => x.costoSinIvaTotal),
    costoConIva: sum(x => x.costoConIvaTotal),
  };
  return { filas, totales };
}

// ─── Generación de número de embarque ────────────────────────────────────────

export function generateShipmentNumber(existing: Shipment[]): string {
  const year = new Date().getFullYear();
  const thisYear = existing.filter(s => s.numero.includes(`-${year}-`));
  const next = String(thisYear.length + 1).padStart(3, '0');
  return `EMB-${year}-${next}`;
}
