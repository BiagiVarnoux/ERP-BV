// src/accounting/licitacion-utils.ts
// Fórmulas de cotización para licitaciones (derivadas del Excel de referencia)

import { LicitacionProducto, ProductoCalc, LicitacionResumen } from './licitacion-types';
import { round2, round6 } from './utils';

// Tipo de cambio oficial boliviano (fijo por ley)
export const TC_OFICIAL = 6.97;

// Tasas fijas
const IVA_ADUANA_RATE = 0.1494;   // 14.94% sobre PRECIO_BOB + GA
const IVA_VENTA_RATE  = 0.13;     // 13% del precio ofertado
const IT_RATE         = 0.03;     // 3% del precio ofertado
const IVA_IT_TOTAL    = IVA_VENTA_RATE + IT_RATE; // 0.16 (para precio piso)
const GA_CIF_EXTRA    = 0.02;     // 2% adicional sobre PRECIO_BOB para base CIF

/**
 * Calcula todos los valores derivados para un producto de cotización.
 * Todas las fórmulas reproducen exactamente el Excel de referencia.
 */
export function calcProducto(p: LicitacionProducto): ProductoCalc {
  const tc       = p.tc || 0;
  const tcEnvio  = p.tc_envio ?? tc;
  const cantidad = p.cantidad || 1;

  // — Costo de compra en Bs (con tax del proveedor) —
  const precio_bs  = round2((p.precio_usd * (1 + p.tax_pct / 100)) * tc);

  // — Precio BOB a tipo de cambio oficial (base para tributos aduaneros) —
  const precio_bob = round2(p.precio_usd * TC_OFICIAL);

  // — Peso volumétrico (kg) —
  const peso = p.m1 && p.m2 && p.m3
    ? round6((p.m1 * p.m2 * p.m3) / 5000)
    : 0;

  // — Envío por unidad: peso × tarifa_envio_USD × tc_envio —
  const envio = round2(peso * (p.tarifa_envio || 0) * tcEnvio);

  // — GA (Gravamen Arancelario): (PRECIO_BOB + ENVÍO + PRECIO_BOB×2%) × ga% —
  const ga_base = precio_bob + envio + precio_bob * GA_CIF_EXTRA;
  const ga      = round2(ga_base * (p.ga_pct / 100));

  // — IVA aduanero: (PRECIO_BOB + GA) × 14.94% —
  const iva_aduana = round2((precio_bob + ga) * IVA_ADUANA_RATE);

  const impuestos = round2(ga + iva_aduana);

  // — Manipuleo: peso × tarifa_manipuleo —
  const manipuleo = round2(peso * (p.tarifa_manipuleo || 0));

  // — Batería —
  const bateria = p.tiene_bateria ? round2(p.costo_bateria) : 0;

  // — TOTAL INDIVIDUAL (costo importación por unidad) —
  const total_individual = round2(precio_bs + envio + impuestos + manipuleo + bateria);

  // — Totales por cantidad —
  const total_import   = round2(total_individual * cantidad);
  const total_ofertado = round2(p.precio_ofertado * cantidad);

  // — IVA neto a pagar (crédito fiscal IVA aduana) —
  // = TOTAL_OFERTADO × 13% − IVA_aduana × cantidad
  const iva_pagar = round2(total_ofertado * IVA_VENTA_RATE - iva_aduana * cantidad);

  // — IT —
  const it_pagar = round2(total_ofertado * IT_RATE);

  // — Costos adicionales (extras) —
  const extras = round2(
    (p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0)
  );

  // — COSTOS TOTALES —
  const costos = round2(total_import + iva_pagar + it_pagar + extras);

  // — GANANCIA y ROI —
  const ganancia = round2(total_ofertado - costos);
  const roi      = costos > 0 ? round2(ganancia / costos) : 0;

  // — PRECIO PISO (precio_ofertado mínimo para ganancia = 0 por unidad) —
  // Despejando: precio_piso × cantidad × (1 - 0.16) = total_import - iva_aduana×cantidad + extras
  // → precio_piso = (total_import - iva_aduana×cantidad + extras) / (cantidad × 0.84)
  const denominador = cantidad * (1 - IVA_IT_TOTAL);
  const precio_piso = denominador > 0
    ? round2((total_import - iva_aduana * cantidad + extras) / denominador)
    : 0;

  return {
    precio_bs,
    precio_bob,
    peso,
    envio,
    ga,
    iva_aduana,
    impuestos,
    manipuleo,
    bateria,
    total_individual,
    total_import,
    total_ofertado,
    iva_pagar,
    it_pagar,
    costos,
    ganancia,
    roi,
    precio_piso,
  };
}

/**
 * Suma los resultados de todos los productos para obtener el resumen global.
 */
export function calcResumen(
  productos: LicitacionProducto[],
  calcs: ProductoCalc[]
): LicitacionResumen {
  let total_import   = 0;
  let total_ofertado = 0;
  let iva_pagar      = 0;
  let it_pagar       = 0;
  let extras         = 0;

  for (let i = 0; i < productos.length; i++) {
    const c = calcs[i];
    const p = productos[i];
    total_import   += c.total_import;
    total_ofertado += c.total_ofertado;
    iva_pagar      += c.iva_pagar;
    it_pagar       += c.it_pagar;
    extras         += (p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0);
  }

  const costos   = round2(total_import + iva_pagar + it_pagar + extras);
  const ganancia = round2(total_ofertado - costos);
  const roi      = costos > 0 ? round2(ganancia / costos) : 0;

  return {
    total_import:   round2(total_import),
    total_ofertado: round2(total_ofertado),
    iva_pagar:      round2(iva_pagar),
    it_pagar:       round2(it_pagar),
    costos,
    ganancia,
    roi,
  };
}

/** Producto vacío con valores por defecto sensatos */
export function emptyProducto(licitacion_id: string, orden: number): LicitacionProducto {
  return {
    id:              crypto.randomUUID(),
    licitacion_id,
    orden,
    nombre:          '',
    especificacion:  undefined,
    link_producto:   undefined,
    hs_code:         undefined,
    cantidad:        1,
    tc:              9.97,
    tc_envio:        undefined,
    precio_usd:      0,
    tax_pct:         0,
    m1:              undefined,
    m2:              undefined,
    m3:              undefined,
    tarifa_envio:    12,
    tarifa_manipuleo: 25,
    ga_pct:          5,
    tiene_bateria:   false,
    costo_bateria:   0,
    precio_ofertado: 0,
    garantia:        0,
    pasaje:          0,
    envio_local:     0,
    otros_costos:    0,
    fuente:          'manual',
  };
}
