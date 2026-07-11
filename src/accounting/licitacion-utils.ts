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
  const cantidad = p.cantidad || 1;

  // — Compra local (Bolivia): sin GA, sin IVA aduanero, sin flete internacional ni T/C —
  if (p.origen === 'local') {
    const precioLocal = p.precio_local || 0;
    const bateria      = p.tiene_bateria ? round2(p.costo_bateria) : 0;
    // Crédito fiscal: solo si la compra tiene factura (13% del precio de compra, igual que el IVA aduana funciona como crédito para los importados).
    const iva_aduana   = p.tiene_factura ? round2(precioLocal * IVA_VENTA_RATE) : 0;

    const total_individual = round2(precioLocal + bateria);
    const total_import     = round2(total_individual * cantidad);
    const total_ofertado   = round2(p.precio_ofertado * cantidad);

    const iva_pagar = round2(total_ofertado * IVA_VENTA_RATE - iva_aduana * cantidad);
    const it_pagar  = round2(total_ofertado * IT_RATE);

    const extras = round2(
      (p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0)
    );

    const costos   = round2(total_import + iva_pagar + it_pagar + extras);
    const ganancia = round2(total_ofertado - costos);
    const roi      = costos > 0 ? round2(ganancia / costos) : 0;

    const denominador = cantidad * (1 - IVA_IT_TOTAL);
    const precio_piso = denominador > 0
      ? round2((total_import - iva_aduana * cantidad + extras) / denominador)
      : 0;

    return {
      precio_bs: precioLocal,
      precio_bob: 0,
      peso_vol: 0,
      peso: 0,
      envio: 0,
      ga_calculado: 0,
      ga: 0,
      iva_aduana_calculado: iva_aduana,
      iva_aduana,
      impuestos: iva_aduana,
      manipuleo: 0,
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

  const tc       = p.tc || 0;
  const tcEnvio  = p.tc_envio ?? tc;

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
  let total_ofertado    = 0;
  let precio_piso_total = 0;
  let iva_pagar         = 0;
  let it_pagar          = 0;
  let extras            = 0;

  // Costo de productos importados
  let costo_importados  = 0;
  let tiene_importados  = false;
  let total_usd         = 0;
  let total_precio_bs   = 0;
  let total_envio       = 0;
  let total_ga          = 0;
  let total_iva_aduana  = 0;
  let total_manipuleo   = 0;

  // Costo de mercadería comprada nacionalmente
  let costo_nacional           = 0;
  let tiene_nacionales         = false;
  let total_iva_credito_local  = 0;

  for (let i = 0; i < productos.length; i++) {
    const c = calcs[i];
    const p = productos[i];
    const cantidad = p.cantidad || 1;
    const esLocal = p.origen === 'local';

    if (esLocal) {
      tiene_nacionales        = true;
      costo_nacional          += c.total_import;
      total_iva_credito_local += c.iva_aduana * cantidad;
    } else {
      tiene_importados = true;
      costo_importados += c.total_import;
      // Desglose: los valores del calc son unitarios → se multiplican por cantidad.
      total_usd        += (p.precio_usd || 0) * cantidad;
      total_precio_bs  += c.precio_bs  * cantidad;
      total_envio      += c.envio      * cantidad;
      total_ga         += c.ga         * cantidad;
      total_iva_aduana += c.iva_aduana * cantidad;
      total_manipuleo  += c.manipuleo  * cantidad;
    }

    total_ofertado    += c.total_ofertado;
    precio_piso_total += c.precio_piso * cantidad;
    iva_pagar         += c.iva_pagar;
    it_pagar          += c.it_pagar;
    extras            += (p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0);
  }

  const total_import = round2(costo_importados + costo_nacional);
  const costos   = round2(total_import + iva_pagar + it_pagar + extras);
  const ganancia = round2(total_ofertado - costos);
  const roi      = costos > 0 ? round2(ganancia / costos) : 0;

  return {
    total_import,
    total_ofertado:    round2(total_ofertado),
    precio_piso_total: round2(precio_piso_total),
    iva_pagar:         round2(iva_pagar),
    it_pagar:          round2(it_pagar),
    costos,
    ganancia,
    roi,

    costo_importados: round2(costo_importados),
    tiene_importados,
    total_usd:         round2(total_usd),
    total_precio_bs:   round2(total_precio_bs),
    total_envio:       round2(total_envio),
    total_ga:          round2(total_ga),
    total_iva_aduana:  round2(total_iva_aduana),
    total_manipuleo:   round2(total_manipuleo),

    costo_nacional: round2(costo_nacional),
    tiene_nacionales,
    total_iva_credito_local: round2(total_iva_credito_local),
  };
}

/**
 * Consolida los resúmenes de varias licitaciones (ya calculados) en uno solo,
 * para la vista de "seleccionar N licitaciones → ver combinado". El ROI se
 * recalcula sobre los totales combinados (no se promedian los ROI individuales).
 */
export function sumarResumenes(resumenes: LicitacionResumen[]): LicitacionResumen {
  const acc = {
    total_import: 0, total_ofertado: 0, precio_piso_total: 0, iva_pagar: 0, it_pagar: 0,
    costos: 0, ganancia: 0,
    costo_importados: 0, tiene_importados: false,
    total_usd: 0, total_precio_bs: 0, total_envio: 0, total_ga: 0, total_iva_aduana: 0, total_manipuleo: 0,
    costo_nacional: 0, tiene_nacionales: false, total_iva_credito_local: 0,
  };

  for (const r of resumenes) {
    acc.total_import        += r.total_import;
    acc.total_ofertado       += r.total_ofertado;
    acc.precio_piso_total    += r.precio_piso_total;
    acc.iva_pagar            += r.iva_pagar;
    acc.it_pagar             += r.it_pagar;
    acc.costos               += r.costos;
    acc.ganancia             += r.ganancia;
    acc.costo_importados     += r.costo_importados;
    acc.tiene_importados      = acc.tiene_importados || r.tiene_importados;
    acc.total_usd            += r.total_usd;
    acc.total_precio_bs      += r.total_precio_bs;
    acc.total_envio          += r.total_envio;
    acc.total_ga             += r.total_ga;
    acc.total_iva_aduana     += r.total_iva_aduana;
    acc.total_manipuleo      += r.total_manipuleo;
    acc.costo_nacional       += r.costo_nacional;
    acc.tiene_nacionales      = acc.tiene_nacionales || r.tiene_nacionales;
    acc.total_iva_credito_local += r.total_iva_credito_local;
  }

  // costos/ganancia se suman directo de cada resumen (ya incluyen los "extras"
  // — garantía/pasaje/envío/otros — que no viajan en LicitacionResumen).
  const costos   = round2(acc.costos);
  const ganancia = round2(acc.ganancia);
  const roi      = costos > 0 ? round2(ganancia / costos) : 0;

  return {
    total_import:      round2(acc.total_import),
    total_ofertado:    round2(acc.total_ofertado),
    precio_piso_total: round2(acc.precio_piso_total),
    iva_pagar:         round2(acc.iva_pagar),
    it_pagar:          round2(acc.it_pagar),
    costos,
    ganancia,
    roi,
    costo_importados: round2(acc.costo_importados),
    tiene_importados: acc.tiene_importados,
    total_usd:         round2(acc.total_usd),
    total_precio_bs:   round2(acc.total_precio_bs),
    total_envio:       round2(acc.total_envio),
    total_ga:          round2(acc.total_ga),
    total_iva_aduana:  round2(acc.total_iva_aduana),
    total_manipuleo:   round2(acc.total_manipuleo),
    costo_nacional: round2(acc.costo_nacional),
    tiene_nacionales: acc.tiene_nacionales,
    total_iva_credito_local: round2(acc.total_iva_credito_local),
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
    origen:          'importado',
    precio_local:    undefined,
    tiene_factura:   false,
    fuente:          'manual',
  };
}
