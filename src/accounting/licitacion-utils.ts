// src/accounting/licitacion-utils.ts
// Fórmulas de cotización para licitaciones (derivadas del Excel de referencia)

import { LicitacionProducto, ProductoCalc, LicitacionResumen } from './licitacion-types';
import { round2, round6 } from './utils';

// Tipo de cambio "oficial" histórico boliviano. Tras la flexibilización cambiaria
// es solo el VALOR POR DEFECTO: la cotización (y cada producto) puede definir su
// propio T/C para los tributos aduaneros (GA + IVA).
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
 *
 * @param tcOficialDefault T/C aduanero por defecto de la cotización. El producto
 *   puede sobreescribirlo con `p.tc_oficial`. Si ambos faltan, se usa TC_OFICIAL.
 */
export function calcProducto(p: LicitacionProducto, tcOficialDefault?: number): ProductoCalc {
  const tc       = p.tc || 0;
  const tcEnvio  = p.tc_envio ?? tc;
  const cantidad = p.cantidad || 1;

  const precioUsd = p.precio_usd ?? 0;

  // T/C para tributos aduaneros: override del producto → default de la cotización → oficial.
  const tcOficial = p.tc_oficial ?? tcOficialDefault ?? TC_OFICIAL;

  // — Costo de compra en Bs (con tax del proveedor) —
  const precio_bs  = round2((precioUsd * (1 + p.tax_pct / 100)) * tc);

  // — Precio BOB al T/C aduanero (base para tributos aduaneros) —
  const precio_bob = round2(precioUsd * tcOficial);

  // — Peso volumétrico (kg) — siempre calculado para referencia —
  const peso_vol = p.m1 && p.m2 && p.m3
    ? round6((p.m1 * p.m2 * p.m3) / 5000)
    : 0;

  // — Peso efectivo: bruto (manual) o volumétrico según toggle —
  const peso = (p.usa_peso_bruto && p.peso_bruto)
    ? round6(p.peso_bruto)
    : peso_vol;

  // — Envío por unidad: peso × tarifa_envio_USD × tc_envio —
  const envio = round2(peso * (p.tarifa_envio || 0) * tcEnvio);

  // — GA (Gravamen Arancelario): (PRECIO_BOB + ENVÍO + PRECIO_BOB×2%) × ga% —
  const ga_base      = precio_bob + envio + precio_bob * GA_CIF_EXTRA;
  const ga_calculado = round2(ga_base * (p.ga_pct / 100));
  const ga           = (p.usa_ga_manual && p.ga_manual != null)
    ? round2(p.ga_manual)
    : ga_calculado;

  // — IVA aduanero: (PRECIO_BOB + GA) × 14.94% —
  const iva_aduana_calculado = round2((precio_bob + ga) * IVA_ADUANA_RATE);
  const iva_aduana           = (p.usa_iva_manual && p.iva_aduana_manual != null)
    ? round2(p.iva_aduana_manual)
    : iva_aduana_calculado;

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
    peso_vol,
    peso,
    envio,
    ga_calculado,
    ga,
    iva_aduana_calculado,
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
  let precio_piso_total = 0;
  let iva_pagar      = 0;
  let it_pagar       = 0;
  let extras         = 0;

  for (let i = 0; i < productos.length; i++) {
    const c = calcs[i];
    const p = productos[i];
    total_import      += c.total_import;
    total_ofertado    += c.total_ofertado;
    precio_piso_total += c.precio_piso * (p.cantidad || 1);
    iva_pagar         += c.iva_pagar;
    it_pagar          += c.it_pagar;
    extras            += (p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0);
  }

  const costos   = round2(total_import + iva_pagar + it_pagar + extras);
  const ganancia = round2(total_ofertado - costos);
  const roi      = costos > 0 ? round2(ganancia / costos) : 0;

  return {
    total_import:      round2(total_import),
    total_ofertado:    round2(total_ofertado),
    precio_piso_total: round2(precio_piso_total),
    iva_pagar:         round2(iva_pagar),
    it_pagar:          round2(it_pagar),
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
    peso_bruto:      undefined,
    usa_peso_bruto:  false,
    tarifa_envio:    12,
    tarifa_manipuleo: 25,
    ga_pct:          5,
    ga_manual:       undefined,
    usa_ga_manual:   false,
    iva_aduana_manual: undefined,
    usa_iva_manual:  false,
    tiene_bateria:   false,
    costo_bateria:   0,
    precio_entidad:  undefined,
    precio_ofertado: 0,
    garantia:        0,
    pasaje:          0,
    envio_local:     0,
    otros_costos:    0,
    fuente:          'manual',
  };
}
