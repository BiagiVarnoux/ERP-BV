// src/accounting/investment-utils.ts
// Motor de cálculo del Análisis de Inversión.
//  · Capa de costeo: reutiliza calcProducto() de licitaciones (USD→Bs, GA, IVA
//    aduana, flete, manipuleo, costo unitario).
//  · Capa temporal: ciclo de caja, ROI mensualizado/anualizado, punto de
//    equilibrio, y VAN/TIR sobre un flujo de caja mensual derivado de la
//    velocidad de venta.

import { LicitacionProducto } from './licitacion-types';
import { calcProducto } from './licitacion-utils';
import { round2 } from './utils';
import {
  InvestmentItem, InvestmentAnalysis, ItemCosteo, ItemTiempo, ItemCalc, InvestmentResumen,
} from './investment-types';

// ─── Costeo: reutiliza el motor de licitaciones ─────────────────────────────

/** Mapea un InvestmentItem a la forma de LicitacionProducto para reusar calcProducto. */
function toLicitacionProducto(it: InvestmentItem): LicitacionProducto {
  return {
    id:                it.id,
    licitacion_id:     it.analysis_id,
    orden:             it.orden,
    nombre:            it.nombre,
    especificacion:    it.especificacion,
    link_producto:     it.link_producto,
    hs_code:           it.hs_code,
    cantidad:          it.cantidad,
    tc:                it.tc,
    tc_envio:          it.tc_envio,
    precio_usd:        it.precio_usd,
    tax_pct:           it.tax_pct,
    m1:                it.m1,
    m2:                it.m2,
    m3:                it.m3,
    peso_bruto:        it.peso_bruto,
    usa_peso_bruto:    it.usa_peso_bruto,
    tarifa_envio:      it.tarifa_envio,
    tarifa_manipuleo:  it.tarifa_manipuleo,
    ga_pct:            it.ga_pct,
    ga_manual:         it.ga_manual,
    usa_ga_manual:     it.usa_ga_manual,
    iva_aduana_manual: it.iva_aduana_manual,
    usa_iva_manual:    it.usa_iva_manual,
    tiene_bateria:     it.tiene_bateria,
    costo_bateria:     it.costo_bateria,
    // El precio de venta esperado juega el rol del "precio ofertado"
    precio_ofertado:   it.precio_venta,
    garantia:          it.garantia,
    pasaje:            it.pasaje,
    envio_local:       it.envio_local,
    otros_costos:      it.otros_costos,
    fuente:            'manual',
  };
}

// Tasas de venta (Bolivia)
const IVA_VENTA_RATE = 0.13;
const IT_RATE        = 0.03;

export function calcCosteo(it: InvestmentItem): ItemCosteo {
  // Lado de costos de importación: reutiliza el motor de licitaciones (no depende
  // del precio de venta). Las salidas de venta (iva_pagar, ganancia, etc.) las
  // recalculamos aquí porque manejamos venta mixta con/sin factura.
  const c = calcProducto(toLicitacionProducto(it));

  const cantidad = Math.max(0, it.cantidad || 0);
  const sinFactura = it.modalidad_venta === 'sin_factura';

  const extras = round2((it.garantia || 0) + (it.pasaje || 0) + (it.envio_local || 0) + (it.otros_costos || 0));
  const costoUnit = c.total_individual;         // costo importación por unidad
  const totalImport = c.total_import;           // costoUnit × cantidad
  const inversion = round2(totalImport + extras);

  const Pc = it.precio_venta || 0;              // con factura
  const Ps = it.precio_venta_sin_factura || 0;  // sin factura

  // La modalidad decide qué precio maneja el análisis:
  //  · con_factura → ingreso = Pc × cantidad, paga IVA (13% − crédito aduana) + IT (3%).
  //  · sin_factura → ingreso = Ps × cantidad, sin IVA ni IT.
  const qCon = sinFactura ? 0 : cantidad;
  const qSin = sinFactura ? cantidad : 0;

  const ingresoCon = round2(Pc * qCon);
  const ingresoSin = round2(Ps * qSin);
  const ingresoTotal = round2(ingresoCon + ingresoSin);

  // Impuestos solo cuando se vende con factura.
  const ivaPagar = round2(ingresoCon * IVA_VENTA_RATE - c.iva_aduana * qCon);
  const itPagar  = round2(ingresoCon * IT_RATE);

  const costos = round2(totalImport + ivaPagar + itPagar + extras);
  const ganancia = round2(ingresoTotal - costos);
  const roi = inversion > 0 ? round2(ganancia / inversion) : 0;

  // Precio CON factura que iguala la ganancia/unidad a la venta SIN factura.
  // Despeje: 0.84·Pc + iva_aduana = Ps  →  Pc = (Ps − iva_aduana) / 0.84
  const denomVenta = 1 - IVA_VENTA_RATE - IT_RATE; // 0.84
  const precioConFacturaSugerido = Ps > 0
    ? round2((Ps - c.iva_aduana) / denomVenta)
    : 0;

  return {
    precio_bs:            c.precio_bs,
    precio_bob:           c.precio_bob,
    peso_vol:             c.peso_vol,
    peso:                 c.peso,
    envio:                c.envio,
    ga_calculado:         c.ga_calculado,
    ga:                   c.ga,
    iva_aduana_calculado: c.iva_aduana_calculado,
    iva_aduana:           c.iva_aduana,
    impuestos:            c.impuestos,
    manipuleo:            c.manipuleo,
    bateria:              c.bateria,
    costo_unitario:       costoUnit,
    inversion,
    ingreso_total:        ingresoTotal,
    ingreso_con_factura:  ingresoCon,
    ingreso_sin_factura:  ingresoSin,
    cantidad_con_factura: qCon,
    cantidad_sin_factura: qSin,
    iva_pagar:            ivaPagar,
    it_pagar:             itPagar,
    costos,
    ganancia,
    roi,
    // Piso con factura: el algebraico de calcProducto. Piso sin factura: el costo
    // unitario puesto en almacén (sin impuestos de venta que recuperar).
    precio_piso:          c.precio_piso,
    precio_piso_sf:       costoUnit,
    precio_con_factura_sugerido: precioConFacturaSugerido,
    extras,
  };
}

// ─── Capa temporal: VAN / TIR ───────────────────────────────────────────────

/** Tasa mensual equivalente a una tasa anual efectiva (en %). */
export function tasaMensual(anualPct: number): number {
  return Math.pow(1 + (anualPct || 0) / 100, 1 / 12) - 1;
}

/** Valor Actual Neto de una serie de flujos mensuales a una tasa mensual dada. */
export function van(flujos: number[], tasaMes: number): number {
  return flujos.reduce((acc, f, t) => acc + f / Math.pow(1 + tasaMes, t), 0);
}

/**
 * Tasa Interna de Retorno mensual por bisección.
 * Devuelve null si no hay cambio de signo (no existe TIR real).
 */
export function tirMensual(flujos: number[]): number | null {
  const hasPos = flujos.some(f => f > 0);
  const hasNeg = flujos.some(f => f < 0);
  if (!hasPos || !hasNeg) return null;

  let lo = -0.9999;   // −99.99% mensual
  let hi = 10;        // +1000% mensual
  let fLo = van(flujos, lo);
  let fHi = van(flujos, hi);
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = van(flujos, mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else                { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/**
 * Construye el flujo de caja mensual del ítem:
 *  · Mes 0: −inversión (se paga la compra/importación por adelantado).
 *  · Durante el plazo de importación: sin ingresos (mercadería en tránsito).
 *  · Luego: ingresos netos mensuales según velocidad de venta hasta agotar el lote.
 *    Ingreso neto por unidad = precio_venta − IVA − IT (impuestos remitidos en la venta).
 */
export function buildFlujos(it: InvestmentItem, costeo: ItemCosteo, plazoImportacionMeses: number): {
  flujos: number[]; mesesVenta: number;
} {
  const cantidad = Math.max(0, it.cantidad || 0);

  // Ingreso neto total recibido por ventas (después de impuestos de venta).
  const ingresoNetoTotal = round2(costeo.ingreso_total - costeo.iva_pagar - costeo.it_pagar);
  const ingresoNetoUnit = cantidad > 0 ? ingresoNetoTotal / cantidad : 0;

  // Plazo de venta: override manual o derivado de la velocidad.
  let mesesVenta: number;
  if (it.meses_venta_override != null && it.meses_venta_override > 0) {
    mesesVenta = it.meses_venta_override;
  } else if (it.velocidad_venta && it.velocidad_venta > 0) {
    mesesVenta = cantidad / it.velocidad_venta;
  } else {
    mesesVenta = 0; // sin dato → todo se cobra de inmediato al llegar
  }

  const lead = Math.max(0, Math.round(plazoImportacionMeses || 0));
  const totalMeses = lead + Math.max(1, Math.ceil(mesesVenta || 0));
  const flujos = new Array(totalMeses + 1).fill(0);

  // Mes 0: salida de capital.
  flujos[0] = -costeo.inversion;

  if (cantidad <= 0 || ingresoNetoTotal === 0) {
    return { flujos, mesesVenta };
  }

  if (mesesVenta <= 0) {
    // Sin plazo de venta: se cobra todo apenas llega (fin del lead time).
    flujos[lead + 1] += round2(ingresoNetoTotal);
    return { flujos, mesesVenta };
  }

  // Reparte unidades por mes según velocidad (o uniforme si es override).
  const udsPorMes = it.meses_venta_override != null && it.meses_venta_override > 0
    ? cantidad / it.meses_venta_override
    : (it.velocidad_venta || cantidad);

  let restante = cantidad;
  let mes = lead + 1;
  while (restante > 0.0001 && mes < flujos.length) {
    const uds = Math.min(udsPorMes, restante);
    flujos[mes] += round2(uds * ingresoNetoUnit);
    restante -= uds;
    mes++;
  }
  // Cualquier residuo por redondeo va al último mes con ventas.
  if (restante > 0.0001) {
    flujos[flujos.length - 1] += round2(restante * ingresoNetoUnit);
  }

  return { flujos, mesesVenta };
}

export function calcTiempo(
  it: InvestmentItem,
  costeo: ItemCosteo,
  plazoImportacionMeses: number,
  costoCapitalAnual: number,
  fucPct = 100,
): ItemTiempo {
  const { flujos, mesesVenta } = buildFlujos(it, costeo, plazoImportacionMeses);
  const lead = Math.max(0, plazoImportacionMeses || 0);
  const ciclo = round2(lead + mesesVenta);

  // Ingreso neto por unidad para punto de equilibrio.
  const cantidad = Math.max(0, it.cantidad || 0);
  const ingresoNetoUnit = cantidad > 0
    ? (costeo.ingreso_total - costeo.iva_pagar - costeo.it_pagar) / cantidad
    : 0;

  const puntoEquilibrio = ingresoNetoUnit > 0
    ? round2(costeo.inversion / ingresoNetoUnit)
    : Infinity;

  // Meses de recuperación: cuándo el flujo acumulado pasa a ≥ 0.
  let acumulado = 0;
  let mesesRecuperacion = Infinity;
  for (let t = 0; t < flujos.length; t++) {
    acumulado += flujos[t];
    if (acumulado >= 0) { mesesRecuperacion = t; break; }
  }

  const roi = costeo.roi;
  const roiMensual = ciclo > 0 ? roi / ciclo : 0;
  const roiAnualizado = ciclo > 0 ? Math.pow(1 + roi, 12 / ciclo) - 1 : 0;
  // Realista: descuenta el tiempo muerto entre ciclos vía el FUC (meses activos = 12×FUC).
  const fuc = Math.min(1, Math.max(0.01, (fucPct || 100) / 100));
  const roiAnualizadoRealista = ciclo > 0 ? Math.pow(1 + roi, (12 * fuc) / ciclo) - 1 : 0;

  const tasaMes = tasaMensual(costoCapitalAnual);
  const vanVal = round2(van(flujos, tasaMes));
  const tirM = tirMensual(flujos);
  const tirAnual = tirM != null ? Math.pow(1 + tirM, 12) - 1 : 0;

  return {
    meses_venta:          round2(mesesVenta),
    ciclo_meses:          ciclo,
    roi_mensual:          roiMensual,
    roi_anualizado:       roiAnualizado,
    roi_anualizado_realista: roiAnualizadoRealista,
    punto_equilibrio_uds: puntoEquilibrio,
    meses_recuperacion:   mesesRecuperacion,
    van:                  vanVal,
    tir_mensual:          tirM ?? 0,
    tir_anual:            tirAnual,
    flujos,
  };
}

export function calcItem(
  it: InvestmentItem,
  plazoImportacionMeses: number,
  costoCapitalAnual: number,
  fucPct = 100,
): ItemCalc {
  const costeo = calcCosteo(it);
  const tiempo = calcTiempo(it, costeo, plazoImportacionMeses, costoCapitalAnual, fucPct);
  return { costeo, tiempo };
}

// ─── Resumen del análisis completo ──────────────────────────────────────────

export function calcResumen(analysis: InvestmentAnalysis, calcs: ItemCalc[]): InvestmentResumen {
  let inversion = 0, ingreso = 0, costos = 0, ganancia = 0, van_ = 0;
  let cicloPonderado = 0;

  for (const c of calcs) {
    inversion += c.costeo.inversion;
    ingreso   += c.costeo.ingreso_total;
    costos    += c.costeo.costos;
    ganancia  += c.costeo.ganancia;
    van_      += c.tiempo.van;
    cicloPonderado += c.tiempo.ciclo_meses * c.costeo.inversion;
  }

  inversion = round2(inversion);
  const roi = inversion > 0 ? round2(ganancia / inversion) : 0;
  const ciclo = inversion > 0 ? round2(cicloPonderado / inversion) : 0;
  const roiAnualizado = ciclo > 0 ? Math.pow(1 + roi, 12 / ciclo) - 1 : 0;
  const fuc = Math.min(1, Math.max(0.01, (analysis.fuc_pct || 100) / 100));
  const roiAnualizadoRealista = ciclo > 0 ? Math.pow(1 + roi, (12 * fuc) / ciclo) - 1 : 0;

  // TIR anual del flujo agregado.
  const maxLen = Math.max(1, ...calcs.map(c => c.tiempo.flujos.length));
  const flujoAgregado = new Array(maxLen).fill(0);
  for (const c of calcs) {
    c.tiempo.flujos.forEach((f, t) => { flujoAgregado[t] += f; });
  }
  const tirM = tirMensual(flujoAgregado);
  const tirAnual = tirM != null ? Math.pow(1 + tirM, 12) - 1 : 0;

  return {
    inversion,
    ingreso_total: round2(ingreso),
    costos:        round2(costos),
    ganancia:      round2(ganancia),
    roi,
    ciclo_meses:   ciclo,
    roi_anualizado: roiAnualizado,
    roi_anualizado_realista: roiAnualizadoRealista,
    van:           round2(van_),
    tir_anual:     tirAnual,
  };
}

// ─── Factory: ítem vacío ────────────────────────────────────────────────────

export function emptyItem(analysis_id: string, orden: number): InvestmentItem {
  return {
    id:               crypto.randomUUID(),
    analysis_id,
    orden,
    nombre:           '',
    especificacion:   undefined,
    link_producto:    undefined,
    hs_code:          undefined,
    cantidad:         1,
    tc:               9.97,
    tc_envio:         undefined,
    precio_usd:       0,
    tax_pct:          0,
    m1:               undefined,
    m2:               undefined,
    m3:               undefined,
    peso_bruto:       undefined,
    usa_peso_bruto:   false,
    tarifa_envio:     12,
    tarifa_manipuleo: 25,
    ga_pct:           5,
    ga_manual:        undefined,
    usa_ga_manual:    false,
    iva_aduana_manual: undefined,
    usa_iva_manual:   false,
    tiene_bateria:    false,
    costo_bateria:    0,
    modalidad_venta:  'con_factura',
    precio_venta:     0,
    precio_venta_sin_factura: 0,
    cantidad_sin_factura:     0,
    garantia:         0,
    pasaje:           0,
    envio_local:      0,
    otros_costos:     0,
    velocidad_venta:  0,
    meses_venta_override: undefined,
    mapped_shipment_product_ids: [],
  };
}
