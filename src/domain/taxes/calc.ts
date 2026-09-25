import { round2 } from '@/accounting/utils';
import type {
  LibroTotales, TaxAmountsInput, TaxDocumentRow, TaxTipoDocumento,
} from './types';

/** Alícuota general del IVA en Bolivia (Ley 843), "por dentro" de la factura. */
export const ALICUOTA_IVA = 13;

/**
 * Tasa efectiva del IVA en importaciones: la Aduana lo liquida "por fuera"
 * sobre CIF + GA, así que 13/87 = 14,94%. Solo se usa como referencia al
 * mostrar una DIM — el crédito fiscal que vale es el importe impreso en ella.
 */
export const ALICUOTA_IVA_IMPORTACION = 14.94;

/**
 * Base imponible que implica el IVA liquidado por la Aduana.
 *
 * Sirve de control cruzado: si el CIF + GA que se leyó del documento no se
 * parece a esto, es que se tomó un campo equivocado. Pasó con una DIMS R-510,
 * donde el lector agarró el GA (285) creyendo que era el CIF: la base quedó en
 * 285 cuando el IVA de 1.864 implicaba ~12.477.
 */
export function baseImplicitaPorIva(iva: number): number {
  return round2(iva / (ALICUOTA_IVA_IMPORTACION / 100));
}

/** ¿La base declarada es coherente con el IVA de la DIM? Tolerancia del 2%. */
export function baseCoherenteConIva(base: number, iva: number): boolean {
  if (!(iva > 0) || !(base > 0)) return true;   // sin datos no se opina
  const esperada = baseImplicitaPorIva(iva);
  return Math.abs(base - esperada) <= esperada * 0.02;
}

/**
 * Base imponible e IVA de un documento fiscal.
 *
 * En Bolivia el IVA es "por dentro": el importe facturado ya lo incluye, y el
 * crédito/débito fiscal es el 13% de ese importe una vez descontados los
 * conceptos que no dan derecho a cómputo (exentos, ICE/IEHD, descuentos).
 */
export function calcularBaseEIva(a: TaxAmountsInput): { base_imponible: number; iva: number } {
  const alicuota = a.alicuota ?? ALICUOTA_IVA;
  const base = round2(
    a.importe_total - (a.importe_ice ?? 0) - (a.importe_exento ?? 0) - (a.descuentos ?? 0)
  );
  const baseNoNegativa = base > 0 ? base : 0;
  // Un IVA explícito (DIM) gana siempre: recalcularlo daría un importe distinto
  // al que la Aduana liquidó y al que se declara ante el SIN.
  const iva = a.iva_manual != null
    ? round2(a.iva_manual)
    : round2(baseNoNegativa * (alicuota / 100));
  return { base_imponible: baseNoNegativa, iva };
}

/**
 * Signo del documento dentro del libro. Las notas de crédito restan: en ventas
 * reducen el débito fiscal y en compras reducen el crédito fiscal. Los importes
 * se guardan siempre en positivo.
 */
export function signoFiscal(tipoDocumento: TaxTipoDocumento): 1 | -1 {
  return tipoDocumento === 'nota_credito' ? -1 : 1;
}

/**
 * Totales de un libro. Las facturas anuladas no computan. En compras, las
 * marcadas sin derecho a crédito fiscal se suman aparte (`iva_sin_derecho`)
 * y NO entran en `iva`.
 */
export function totalesLibro(rows: TaxDocumentRow[]): LibroTotales {
  let importe = 0, base = 0, iva = 0, ivaSinDerecho = 0, documentos = 0;

  for (const r of rows) {
    if (r.estado === 'anulada') continue;
    const s = signoFiscal(r.tipo_documento);
    documentos += 1;
    importe = round2(importe + s * r.importe_total);
    base    = round2(base    + s * r.base_imponible);
    if (r.tipo === 'compra' && !r.con_derecho_credito) {
      ivaSinDerecho = round2(ivaSinDerecho + s * r.iva);
    } else {
      iva = round2(iva + s * r.iva);
    }
  }

  return {
    documentos,
    importe_total: importe,
    base_imponible: base,
    iva,
    iva_sin_derecho: ivaSinDerecho,
  };
}

/** Período de declaración (YYYY-MM) que corresponde por defecto a una fecha. */
export function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** '2026-09' → 'Septiembre 2026'. Devuelve el original si no es un período válido. */
export function formatPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${mes} ${m[1]}` : periodo;
}

/** Los N períodos (YYYY-MM) más recientes terminando en `hasta`, del más nuevo al más viejo. */
export function periodosRecientes(hasta: string, cantidad = 24): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(hasta);
  if (!m) return [hasta];
  let year = Number(m[1]);
  let month = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return out;
}

export const TIPO_DOCUMENTO_LABEL: Record<TaxTipoDocumento, string> = {
  factura:         'Factura',
  nota_credito:    'Nota de crédito',
  nota_debito:     'Nota de débito',
  dui:             'DUI (importación)',
  recibo_alquiler: 'Recibo de alquiler',
  otro:            'Otro',
};
