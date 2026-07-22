// src/accounting/investment-utils.ts
// Motor de cálculo del Análisis de Inversión.
//  · Capa de costeo: reutiliza calcProducto() de licitaciones (USD→Bs, GA, IVA
//    aduana, flete, manipuleo, costo unitario).
//  · Capa temporal: ciclo de caja, ROI mensualizado/anualizado, punto de
//    equilibrio, y VAN/TIR sobre un flujo de caja mensual derivado de la
//    velocidad de venta.

import { LicitacionProducto } from './licitacion-types';
import { calcProducto, type CalcDefaults } from './licitacion-utils';
import { round2 } from './utils';
import {
  InvestmentItem, InvestmentAnalysis, ItemCosteo, ItemTiempo, ItemCalc, InvestmentResumen,
} from './investment-types';
import type { ShipmentProduct } from './shipment-types';
import type { ShipmentRealizedDetailRow } from './investment-storage';

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
    // Los análisis de inversión siempre modelan importaciones.
    origen:            'importado',
    cantidad:          it.cantidad,
    tc:                it.tc,
    tc_envio:          it.tc_envio,
    tc_oficial:        it.tc_oficial,
    flete_cif_pct:     it.flete_cif_pct,
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

export function calcCosteo(it: InvestmentItem, defaults?: CalcDefaults): ItemCosteo {
  // Lado de costos de importación: reutiliza el motor de licitaciones (no depende
  // del precio de venta). Las salidas de venta (iva_pagar, ganancia, etc.) las
  // recalculamos aquí porque manejamos venta mixta con/sin factura.
  const c = calcProducto(toLicitacionProducto(it), defaults);

  const cantidad = Math.max(0, it.cantidad || 0);
  const sinFactura = it.modalidad_venta === 'sin_factura';

  const extras = round2((it.garantia || 0) + (it.pasaje || 0) + (it.envio_local || 0) + (it.otros_costos || 0));
  const costoUnit = c.total_individual;         // costo importación por unidad (CON IVA aduana)
  // Costo contable del inventario: sin el IVA aduana (que es crédito fiscal, no costo).
  // Es el mismo número que se capitaliza en el embarque y va al COGS real.
  const costoUnitSinIva = round2(costoUnit - c.iva_aduana);
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
    flete_cif:            c.flete_cif,
    cif:                  c.cif,
    ga_calculado:         c.ga_calculado,
    ga:                   c.ga,
    iva_aduana_calculado: c.iva_aduana_calculado,
    iva_aduana:           c.iva_aduana,
    impuestos:            c.impuestos,
    manipuleo:            c.manipuleo,
    bateria:              c.bateria,
    costo_unitario:       costoUnit,
    costo_unitario_sin_iva: costoUnitSinIva,
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
  defaults?: CalcDefaults,
): ItemCalc {
  const costeo = calcCosteo(it, defaults);
  const tiempo = calcTiempo(it, costeo, plazoImportacionMeses, costoCapitalAnual, fucPct);
  return { costeo, tiempo };
}

// ─── Resumen del análisis completo ──────────────────────────────────────────

export function calcResumen(analysis: InvestmentAnalysis, calcs: ItemCalc[]): InvestmentResumen {
  let inversion = 0, ingreso = 0, costos = 0, ganancia = 0, van_ = 0;
  let cicloPonderado = 0;
  let gaTotal = 0, ivaAduanaTotal = 0, ivaPagar = 0, itPagar = 0;
  let totalUsd = 0, totalPrecioBs = 0, totalEnvio = 0, totalManipuleo = 0;

  for (let i = 0; i < calcs.length; i++) {
    const c = calcs[i];
    const item = analysis.items[i];
    const cantidad = item?.cantidad || 0;
    inversion += c.costeo.inversion;
    ingreso   += c.costeo.ingreso_total;
    costos    += c.costeo.costos;
    ganancia  += c.costeo.ganancia;
    van_      += c.tiempo.van;
    cicloPonderado += c.tiempo.ciclo_meses * c.costeo.inversion;
    // GA e IVA aduana son unitarios en el costeo → se multiplican por cantidad.
    gaTotal        += c.costeo.ga * cantidad;
    ivaAduanaTotal += c.costeo.iva_aduana * cantidad;
    // IVA e IT a pagar ya son totales por ítem.
    ivaPagar       += c.costeo.iva_pagar;
    itPagar        += c.costeo.it_pagar;
    // Desglose de costos (unitarios × cantidad).
    totalUsd       += (item?.precio_usd || 0) * cantidad;
    totalPrecioBs  += c.costeo.precio_bs * cantidad;
    totalEnvio     += c.costeo.envio     * cantidad;
    totalManipuleo += c.costeo.manipuleo * cantidad;
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
    total_usd:        round2(totalUsd),
    total_precio_bs:  round2(totalPrecioBs),
    total_envio:      round2(totalEnvio),
    total_manipuleo:  round2(totalManipuleo),
    ga_total:         round2(gaTotal),
    iva_aduana_total: round2(ivaAduanaTotal),
    iva_pagar:        round2(ivaPagar),
    it_pagar:         round2(itPagar),
    ciclo_meses:   ciclo,
    roi_anualizado: roiAnualizado,
    roi_anualizado_realista: roiAnualizadoRealista,
    van:           round2(van_),
    tir_anual:     tirAnual,
  };
}

/**
 * Consolida varios análisis de inversión en un solo resumen "portafolio".
 *
 * A diferencia de sumar resúmenes ya calculados, aquí se recombinan los
 * FLUJOS DE CAJA de todos los ítems de todos los análisis (igual que
 * calcResumen ya hace dentro de un solo análisis) para obtener un VAN y una
 * TIR realmente consolidados — no un promedio ni una suma naíf de tasas,
 * que matemáticamente no tendría sentido.
 */
export function consolidarAnalisis(analyses: InvestmentAnalysis[]): InvestmentResumen {
  let inversion = 0, ingreso = 0, costos = 0, ganancia = 0, van_ = 0;
  let cicloPonderado = 0;
  let gaTotal = 0, ivaAduanaTotal = 0, ivaPagar = 0, itPagar = 0;
  let totalUsd = 0, totalPrecioBs = 0, totalEnvio = 0, totalManipuleo = 0;
  let fucPonderadoSum = 0;
  let maxLen = 1;
  const todosLosFlujos: number[][] = [];

  for (const a of analyses) {
    const calcs = a.items.map(it =>
      calcItem(it, a.plazo_importacion_meses, a.costo_capital_anual, a.fuc_pct, {
        tcOficial: a.tc_oficial, fleteCifPct: a.flete_cif_pct,
      })
    );

    let inversionAnalisis = 0;
    for (let i = 0; i < calcs.length; i++) {
      const c = calcs[i];
      const item = a.items[i];
      const cantidad = item?.cantidad || 0;
      inversion += c.costeo.inversion;
      inversionAnalisis += c.costeo.inversion;
      ingreso   += c.costeo.ingreso_total;
      costos    += c.costeo.costos;
      ganancia  += c.costeo.ganancia;
      van_      += c.tiempo.van;
      cicloPonderado += c.tiempo.ciclo_meses * c.costeo.inversion;
      gaTotal        += c.costeo.ga * cantidad;
      ivaAduanaTotal += c.costeo.iva_aduana * cantidad;
      ivaPagar       += c.costeo.iva_pagar;
      itPagar        += c.costeo.it_pagar;
      totalUsd       += (item?.precio_usd || 0) * cantidad;
      totalPrecioBs  += c.costeo.precio_bs * cantidad;
      totalEnvio     += c.costeo.envio     * cantidad;
      totalManipuleo += c.costeo.manipuleo * cantidad;
      todosLosFlujos.push(c.tiempo.flujos);
      maxLen = Math.max(maxLen, c.tiempo.flujos.length);
    }
    fucPonderadoSum += (a.fuc_pct ?? 100) * inversionAnalisis;
  }

  inversion = round2(inversion);
  const roi   = inversion > 0 ? round2(ganancia / inversion) : 0;
  const ciclo = inversion > 0 ? round2(cicloPonderado / inversion) : 0;
  const roiAnualizado = ciclo > 0 ? Math.pow(1 + roi, 12 / ciclo) - 1 : 0;
  const fucPonderado = inversion > 0 ? fucPonderadoSum / inversion : 100;
  const fuc = Math.min(1, Math.max(0.01, fucPonderado / 100));
  const roiAnualizadoRealista = ciclo > 0 ? Math.pow(1 + roi, (12 * fuc) / ciclo) - 1 : 0;

  // TIR/VAN reales del portafolio: se combinan los flujos de TODOS los ítems
  // de TODOS los análisis por mes (mismo criterio que calcResumen usa dentro
  // de un solo análisis), no se promedian tasas.
  const flujoAgregado = new Array(maxLen).fill(0);
  for (const flujos of todosLosFlujos) {
    flujos.forEach((f, t) => { flujoAgregado[t] += f; });
  }
  const tirM = tirMensual(flujoAgregado);
  const tirAnual = tirM != null ? Math.pow(1 + tirM, 12) - 1 : 0;

  return {
    inversion,
    ingreso_total: round2(ingreso),
    costos:        round2(costos),
    ganancia:      round2(ganancia),
    roi,
    total_usd:        round2(totalUsd),
    total_precio_bs:  round2(totalPrecioBs),
    total_envio:      round2(totalEnvio),
    total_manipuleo:  round2(totalManipuleo),
    ga_total:         round2(gaTotal),
    iva_aduana_total: round2(ivaAduanaTotal),
    iva_pagar:        round2(ivaPagar),
    it_pagar:         round2(itPagar),
    ciclo_meses:   ciclo,
    roi_anualizado: roiAnualizado,
    roi_anualizado_realista: roiAnualizadoRealista,
    van:           round2(van_),
    tir_anual:     tirAnual,
  };
}

// ─── Conciliación con embarque real: costo/venta REAL vs cotizado ───────────
//
// A diferencia de calcCosteo/calcTiempo (que simulan todo desde cero), aquí se
// parte del costo real ya capitalizado por el embarque (ShipmentProduct.costo_
// total_unitario) y de las ventas realmente atribuidas (RPC de embarques). Las
// unidades que aún no se vendieron se proyectan al precio y velocidad
// COTIZADOS — así se aísla el efecto de un costo real distinto sin mezclar
// supuestos de venta nuevos.

/** Meses calendario completos entre dos fechas YYYY-MM-DD (puede ser negativo). */
function mesesEntreFechas(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00');
  const b = new Date(hasta + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Flujo de caja REAL de un ítem: mes 0 = −inversión real (fecha de compra).
 * Las ventas ya realizadas se ubican en su mes calendario exacto; las unidades
 * restantes se proyectan al precio/velocidad cotizados, a partir del último
 * mes con venta real (o del mes 0 si aún no se vendió nada).
 */
export function buildFlujosReales(
  it: InvestmentItem,
  inversionReal: number,
  fechaCompra: string,
  ventasReales: ShipmentRealizedDetailRow[],
  cantidadReal: number,
  ingresoNetoUnitPlaneado: number,
): { flujos: number[]; mesesVenta: number; unidadesRestantes: number } {
  const unidadesVendidas = round2(ventasReales.reduce((s, v) => s + v.unidades, 0));
  const unidadesRestantes = Math.max(0, round2(cantidadReal - unidadesVendidas));

  const mesesVentasReales = ventasReales.map(v => Math.max(0, mesesEntreFechas(fechaCompra, v.fecha)));
  const ultimoMesReal = mesesVentasReales.length > 0 ? Math.max(...mesesVentasReales) : 0;

  const udsPorMes = it.velocidad_venta && it.velocidad_venta > 0 ? it.velocidad_venta : unidadesRestantes;
  const mesesProyeccion = unidadesRestantes > 0.0001
    ? Math.max(1, Math.ceil(unidadesRestantes / (udsPorMes || unidadesRestantes)))
    : 0;

  const totalMeses = ultimoMesReal + mesesProyeccion;
  const flujos = new Array(totalMeses + 1).fill(0);
  flujos[0] = -inversionReal;

  ventasReales.forEach((v, i) => {
    const mes = mesesVentasReales[i];
    flujos[mes] = round2((flujos[mes] || 0) + v.ingreso_neto);
  });

  if (unidadesRestantes > 0.0001) {
    let restante = unidadesRestantes;
    let mes = ultimoMesReal + 1;
    while (restante > 0.0001 && mes < flujos.length) {
      const uds = Math.min(udsPorMes, restante);
      flujos[mes] = round2((flujos[mes] || 0) + uds * ingresoNetoUnitPlaneado);
      restante -= uds;
      mes++;
    }
    if (restante > 0.0001) {
      flujos[flujos.length - 1] = round2((flujos[flujos.length - 1] || 0) + restante * ingresoNetoUnitPlaneado);
    }
  }

  return { flujos, mesesVenta: totalMeses, unidadesRestantes };
}

export interface ItemResultadoReal {
  cantidadReal: number;
  costoUnitarioReal: number;       // sin IVA aduana (costo contable/COGS, igual convención que costo_unitario_sin_iva)
  costoSinIvaReal: number;         // = costoUnitarioReal × cantidadReal
  ivaAduanaReal: number;           // IVA aduana real total (p.iva_monto), informativo
  inversionReal: number;           // costoSinIvaReal + ivaAduanaReal + extras — capital REAL desembolsado (con IVA)
  unidadesVendidas: number;
  ingresoRealVentas: number;
  unidadesRestantes: number;
  ingresoProyectadoRestante: number;
  ingresoTotalProyectado: number;
  costos: number;                  // costo económico: sin IVA + la parte de IVA NO recuperable (ventas sin factura)
  ganancia: number;
  roi: number;                     // ganancia / inversionReal (capital con IVA realmente comprometido)
  ciclo_meses: number;
  van: number;
  tir_anual: number;
  flujos: number[];
}

/**
 * Resultado real de un ítem ya mapeado a un embarque cerrado. Devuelve `null`
 * si el embarque aún no cerró (sin costo real todavía) o si el ítem no tiene
 * ninguna fila mapeada.
 *
 * IMPORTANTE — con IVA vs sin IVA: ShipmentProduct.costo_total_unitario es el
 * costo CONTABLE del embarque (sin IVA aduana, porque es crédito fiscal, no
 * costo — ver shipment-utils.ts calcCostoFinalPorProducto). El costeo cotizado
 * (ItemCosteo.inversion), en cambio, SÍ incluye el IVA aduana dentro del costo
 * unitario. Comparar "inversión cotizada" contra "costo_total_unitario real"
 * directamente mezcla bases distintas (esa era la causa del desfase reportado:
 * 71k cotizado vs "64k real" que en realidad no traía el IVA). Aquí se
 * reconstruye el real "con IVA" sumando p.iva_monto, para que ambos lados de
 * la comparación de INVERSIÓN estén en la misma base (capital efectivamente
 * desembolsado). Para GANANCIA, el IVA aduana se recupera como crédito fiscal
 * solo en las ventas con factura (igual que ya hace calcCosteo cotizado); en
 * las ventas sin factura queda como costo real no recuperable.
 */
export function calcResultadoReal(
  it: InvestmentItem,
  costeoCotizado: ItemCosteo,
  mappedProducts: ShipmentProduct[],
  ventasRealesDetalle: ShipmentRealizedDetailRow[],
  costoCapitalAnual: number,
): ItemResultadoReal | null {
  if (mappedProducts.length === 0) return null;
  if (!mappedProducts.every(p => p.costo_total_unitario != null)) return null;

  const cantidadReal = mappedProducts.reduce((s, p) => s + (p.cantidad || 0), 0);
  const costoSinIvaReal = mappedProducts.reduce(
    (s, p) => s + (p.costo_total_unitario || 0) * (p.cantidad || 0), 0
  );
  const ivaAduanaReal = mappedProducts.reduce((s, p) => s + (p.iva_monto || 0), 0);
  const costoUnitarioReal = cantidadReal > 0 ? round2(costoSinIvaReal / cantidadReal) : 0;
  const ivaPorUnidadReal = cantidadReal > 0 ? ivaAduanaReal / cantidadReal : 0;
  const inversionReal = round2(costoSinIvaReal + ivaAduanaReal + costeoCotizado.extras);

  const unidadesVendidas = round2(ventasRealesDetalle.reduce((s, v) => s + v.unidades, 0));
  const ingresoRealVentas = round2(ventasRealesDetalle.reduce((s, v) => s + v.ingreso_neto, 0));
  const unidadesRestantes = Math.max(0, round2(cantidadReal - unidadesVendidas));

  // Precio neto planeado por unidad (después de IVA/IT de venta), para proyectar lo aún no vendido.
  const ingresoNetoUnitPlaneado = it.cantidad > 0
    ? (costeoCotizado.ingreso_total - costeoCotizado.iva_pagar - costeoCotizado.it_pagar) / it.cantidad
    : 0;
  const ingresoProyectadoRestante = round2(unidadesRestantes * ingresoNetoUnitPlaneado);
  const ingresoTotalProyectado = round2(ingresoRealVentas + ingresoProyectadoRestante);

  // El IVA aduana se recupera (crédito fiscal) solo en las unidades vendidas CON
  // factura — igual criterio que calcCosteo() cotizado. Lo proyectado (aún sin
  // vender) hereda la modalidad de venta cotizada del ítem.
  const unidadesConFacturaReales = round2(ventasRealesDetalle.reduce((s, v) => s + v.con_factura, 0));
  const unidadesConFacturaProyectadas = it.modalidad_venta === 'sin_factura' ? 0 : unidadesRestantes;
  const unidadesConFacturaTotal = unidadesConFacturaReales + unidadesConFacturaProyectadas;
  const ivaNoRecuperable = round2(Math.max(0, cantidadReal - unidadesConFacturaTotal) * ivaPorUnidadReal);

  const costos = round2(costoSinIvaReal + ivaNoRecuperable + costeoCotizado.extras);
  const ganancia = round2(ingresoTotalProyectado - costos);
  const roi = inversionReal > 0 ? round2(ganancia / inversionReal) : 0;

  const fechaCompra = mappedProducts.find(p => p.fecha_compra)?.fecha_compra;
  const { flujos, mesesVenta } = fechaCompra
    ? buildFlujosReales(it, inversionReal, fechaCompra, ventasRealesDetalle, cantidadReal, ingresoNetoUnitPlaneado)
    : { flujos: [-inversionReal, ingresoTotalProyectado], mesesVenta: 1 };

  const tasaMes = tasaMensual(costoCapitalAnual);
  const vanVal = round2(van(flujos, tasaMes));
  const tirM = tirMensual(flujos);
  const tirAnual = tirM != null ? Math.pow(1 + tirM, 12) - 1 : 0;

  return {
    cantidadReal, costoUnitarioReal, costoSinIvaReal: round2(costoSinIvaReal), ivaAduanaReal: round2(ivaAduanaReal), inversionReal,
    unidadesVendidas, ingresoRealVentas, unidadesRestantes, ingresoProyectadoRestante, ingresoTotalProyectado,
    costos, ganancia, roi, ciclo_meses: round2(mesesVenta), van: vanVal, tir_anual: tirAnual, flujos,
  };
}

export interface ResumenReal {
  itemsConCostoReal: number;
  itemsTotal: number;
  inversionEstimada: number;       // con IVA aduana (capital comprometido)
  inversionReal: number;           // con IVA aduana real — misma base que inversionEstimada
  costoSinIvaEstimado: number;     // costo contable/COGS cotizado (sin IVA aduana)
  costoSinIvaReal: number;         // costo contable/COGS real (sin IVA aduana) — comparable 1:1
  gananciaEstimada: number;
  gananciaReal: number;
  roiEstimado: number;
  roiReal: number;
  vanEstimado: number;
  vanReal: number;
  tirEstimadoAnual: number;
  tirRealAnual: number;
}

/**
 * Agrega los resultados reales por ítem en un resumen "análisis completo",
 * comparable 1:1 contra calcResumen() (cotizado). Los ítems sin dato real
 * (embarque no cerrado, o sin mapear) aportan su valor COTIZADO al total real,
 * para no distorsionar la comparación con ceros.
 */
export function calcResumenReal(
  costoCapitalAnual: number,
  items: InvestmentItem[],
  calcs: ItemCalc[],
  resultadosReales: (ItemResultadoReal | null)[],
): ResumenReal {
  let inversionEstimada = 0, gananciaEstimada = 0;
  let inversionReal = 0, gananciaReal = 0;
  let costoSinIvaEstimado = 0, costoSinIvaReal = 0;
  let itemsConCostoReal = 0;
  let maxLen = 1;
  const flujosParaVanReal: number[][] = [];

  for (let i = 0; i < calcs.length; i++) {
    const item = calcs[i];
    const cantidad = items[i]?.cantidad || 0;
    inversionEstimada   += item.costeo.inversion;
    gananciaEstimada    += item.costeo.ganancia;
    costoSinIvaEstimado += item.costeo.costo_unitario_sin_iva * cantidad;

    const real = resultadosReales[i];
    if (real) {
      itemsConCostoReal++;
      inversionReal   += real.inversionReal;
      gananciaReal    += real.ganancia;
      costoSinIvaReal += real.costoSinIvaReal;
      flujosParaVanReal.push(real.flujos);
    } else {
      // Sin dato real todavía: usar el cotizado para no distorsionar el total.
      inversionReal   += item.costeo.inversion;
      gananciaReal    += item.costeo.ganancia;
      costoSinIvaReal += item.costeo.costo_unitario_sin_iva * cantidad;
      flujosParaVanReal.push(item.tiempo.flujos);
    }
    maxLen = Math.max(maxLen, flujosParaVanReal[i].length);
  }

  inversionEstimada   = round2(inversionEstimada);
  inversionReal       = round2(inversionReal);
  gananciaEstimada    = round2(gananciaEstimada);
  gananciaReal        = round2(gananciaReal);
  costoSinIvaEstimado = round2(costoSinIvaEstimado);
  costoSinIvaReal     = round2(costoSinIvaReal);

  const roiEstimado = inversionEstimada > 0 ? round2(gananciaEstimada / inversionEstimada) : 0;
  const roiReal     = inversionReal > 0 ? round2(gananciaReal / inversionReal) : 0;

  const flujoAgregadoReal = new Array(maxLen).fill(0);
  for (const f of flujosParaVanReal) f.forEach((v, t) => { flujoAgregadoReal[t] += v; });
  const tasaMes = tasaMensual(costoCapitalAnual);
  const vanReal = round2(van(flujoAgregadoReal, tasaMes));
  const tirMReal = tirMensual(flujoAgregadoReal);
  const tirRealAnual = tirMReal != null ? Math.pow(1 + tirMReal, 12) - 1 : 0;

  const vanEstimado = round2(calcs.reduce((s, c) => s + c.tiempo.van, 0));
  const maxLenEst = Math.max(1, ...calcs.map(c => c.tiempo.flujos.length));
  const flujoAgregadoEst = new Array(maxLenEst).fill(0);
  calcs.forEach(c => c.tiempo.flujos.forEach((v, t) => { flujoAgregadoEst[t] += v; }));
  const tirMEst = tirMensual(flujoAgregadoEst);
  const tirEstimadoAnual = tirMEst != null ? Math.pow(1 + tirMEst, 12) - 1 : 0;

  return {
    itemsConCostoReal, itemsTotal: calcs.length,
    inversionEstimada, inversionReal,
    costoSinIvaEstimado, costoSinIvaReal,
    gananciaEstimada, gananciaReal,
    roiEstimado, roiReal, vanEstimado, vanReal, tirEstimadoAnual, tirRealAnual,
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
