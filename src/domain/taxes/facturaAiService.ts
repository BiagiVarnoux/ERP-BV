// Lectura asistida de facturas para el libro fiscal.
//
// Estrategia por tipo de archivo:
//   · PDF con capa de texto (factura electrónica del SIN) → se extrae el texto
//     en el navegador con pdf.js y se manda SOLO texto al modelo. Es el caso
//     normal hoy en Bolivia: rápido, barato y sin errores de OCR.
//   · PDF escaneado (sin texto) → se rasteriza la primera página y se manda
//     como imagen al modelo con visión.
//   · Imagen (foto de una factura de papel) → se manda directo al modelo con
//     visión, reescalada para no pasarse del límite de la función.
//
// La API key de Groq nunca toca el cliente: la llamada va a la Edge Function
// `ai-factura`, que la lee del secreto GROQ_API_KEY.
import { supabase } from '@/integrations/supabase/client';
import { round2 } from '@/accounting/utils';
import type { TaxDocTipo } from './types';

/** Lo que el modelo devuelve, ya normalizado y listo para precargar el formulario. */
export interface FacturaExtraida {
  razon_social: string | null;
  nit: string | null;
  numero_factura: string | null;
  numero_autorizacion: string | null;
  codigo_control: string | null;
  fecha: string | null;
  importe_total: number | null;
  descuentos: number;
  importe_exento: number;
  importe_ice: number;
  /** "IMPORTE BASE CRÉDITO FISCAL" cuando la factura lo trae explícito. */
  importe_base_credito_fiscal: number | null;
  con_derecho_credito: boolean | null;
  /** true = el documento es una DIM/DUI de la Aduana, no una factura comercial. */
  es_dim: boolean;
  /** Solo DIM: "Total valor CIF aduana (BOB)" (campo F10). */
  valor_cif_bob: number | null;
  /** Solo DIM: gravamen arancelario determinado. */
  gravamen_arancelario: number | null;
  /**
   * Solo DIM: el IVA que liquidó la Aduana. Es el crédito fiscal exacto —
   * NO se recalcula, porque en importaciones el IVA va "por fuera" (14,94%
   * sobre CIF + GA) y recalcularlo daría otro número al declarado.
   */
  iva_pagado: number | null;
  confianza: 'alta' | 'media' | 'baja';
  /** Cómo se leyó el documento, para poder avisar al usuario. */
  via: 'texto' | 'imagen';
}

/** Tamaño máximo del archivo que se acepta adjuntar (coincide con el bucket). */
export const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024;

export const MIMES_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Lado mayor al que se reescala una imagen antes de mandarla al modelo. */
const MAX_LADO_IMAGEN = 1600;

// ─── Extracción del contenido del archivo ─────────────────────────────────────

/**
 * pdf.js se carga bajo demanda: son ~350 KB que solo hacen falta si el usuario
 * adjunta un PDF, así que no deben entrar en el bundle inicial.
 */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Marca de una DIM/DUI. Su primera página ya trae todo lo que necesita el libro. */
const PATRON_DIM = /DECLARACI[ÓO]N DE MERCANC[ÍI]AS DE IMPORTACI[ÓO]N|DIM R-505/i;

/** Texto por página del PDF; array vacío de páginas si no hay capa de texto. */
async function extraerPaginasPdf(file: File): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const contenido = await (await doc.getPage(p)).getTextContent();
    paginas.push(
      contenido.items.map(i => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim(),
    );
  }
  return paginas;
}

/**
 * Texto que se manda al modelo. En una DIM se manda SOLO la primera página:
 * ahí están la identificación (A), los operadores (B), los totales (F) y la
 * tabla de liquidación de tributos con el IVA. Las páginas siguientes son el
 * detalle de ítems y solo sirven para gastar tokens — la cuenta de Groq tiene
 * un límite de 8.000 tokens por minuto y una DIM completa se come la mitad.
 */
function textoParaAnalizar(paginas: string[]): string {
  const completo = paginas.join('\n').trim();
  if (paginas.length > 1 && PATRON_DIM.test(paginas[0])) return paginas[0];
  return completo;
}

/** Primera página del PDF rasterizada a PNG (respaldo para PDFs escaneados). */
async function rasterizarPrimeraPagina(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const escala = MAX_LADO_IMAGEN / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale: Math.min(escala, 3) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el lienzo para leer el PDF');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/** Imagen reescalada a JPEG para que entre en el límite de la función. */
async function prepararImagen(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO_IMAGEN / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el lienzo para leer la imagen');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── Normalización de la respuesta del modelo ─────────────────────────────────

function aNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v);
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? round2(n) : null;
  }
  return null;
}

function aTexto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s;
}

/** Acepta YYYY-MM-DD; si llega DD/MM/YYYY lo convierte. Cualquier otra cosa, null. */
function aFecha(v: unknown): string | null {
  const s = aTexto(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) {
    const [, d, mes, a] = m;
    return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function normalizar(crudo: Record<string, unknown>, via: 'texto' | 'imagen'): FacturaExtraida {
  const confianzaCruda = aTexto(crudo.confianza)?.toLowerCase();
  return {
    razon_social:        aTexto(crudo.razon_social),
    // El NIT llega a veces con puntos o guiones; el libro lo guarda solo con dígitos.
    nit:                 aTexto(crudo.nit)?.replace(/\D/g, '') || null,
    numero_factura:      aTexto(crudo.numero_factura),
    numero_autorizacion: aTexto(crudo.numero_autorizacion)?.replace(/\s/g, '') || null,
    codigo_control:      aTexto(crudo.codigo_control),
    fecha:               aFecha(crudo.fecha),
    importe_total:       aNumero(crudo.importe_total),
    descuentos:          aNumero(crudo.descuentos) ?? 0,
    importe_exento:      aNumero(crudo.importe_exento) ?? 0,
    importe_ice:         aNumero(crudo.importe_ice) ?? 0,
    importe_base_credito_fiscal: aNumero(crudo.importe_base_credito_fiscal),
    con_derecho_credito: typeof crudo.con_derecho_credito === 'boolean' ? crudo.con_derecho_credito : null,
    es_dim:               crudo.es_dim === true,
    valor_cif_bob:        aNumero(crudo.valor_cif_bob),
    gravamen_arancelario: aNumero(crudo.gravamen_arancelario),
    iva_pagado:           aNumero(crudo.iva_pagado),
    confianza: confianzaCruda === 'alta' || confianzaCruda === 'media' || confianzaCruda === 'baja'
      ? confianzaCruda
      // Una lectura por imagen sin autoevaluación se trata como dudosa: el
      // usuario debe revisar los importes antes de registrar.
      : (via === 'texto' ? 'media' : 'baja'),
    via,
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Lee una factura y devuelve los campos detectados. Nunca registra nada: el
 * usuario revisa y confirma en el formulario.
 */
export async function extraerDatosDeFactura(file: File, tipo: TaxDocTipo): Promise<FacturaExtraida> {
  if (!MIMES_ACEPTADOS.includes(file.type)) {
    throw new Error('Formato no soportado. Adjunta un PDF o una imagen (JPG, PNG o WEBP).');
  }
  if (file.size > MAX_ARCHIVO_BYTES) {
    throw new Error('El archivo supera los 20 MB.');
  }

  let payload: Record<string, unknown>;
  let via: 'texto' | 'imagen';

  if (file.type === 'application/pdf') {
    const texto = textoParaAnalizar(await extraerPaginasPdf(file));
    // Un PDF escaneado devuelve una capa de texto vacía o casi vacía; por
    // debajo de este umbral no hay nada que interpretar y se pasa a visión.
    if (texto.length >= 80) {
      payload = { modo: 'texto', tipo, texto };
      via = 'texto';
    } else {
      payload = { modo: 'imagen', tipo, imagenBase64: await rasterizarPrimeraPagina(file) };
      via = 'imagen';
    }
  } else {
    payload = { modo: 'imagen', tipo, imagenBase64: await prepararImagen(file) };
    via = 'imagen';
  }

  const { data, error } = await supabase.functions.invoke('ai-factura', { body: payload });
  if (error) throw new Error(`No se pudo leer la factura: ${error.message}`);
  if (data?.error) throw new Error(data.error);

  const contenido = data?.choices?.[0]?.message?.content;
  if (typeof contenido !== 'string') throw new Error('La IA no devolvió datos legibles');

  let crudo: Record<string, unknown>;
  try {
    crudo = JSON.parse(contenido);
  } catch {
    throw new Error('La IA no devolvió un JSON válido');
  }

  return normalizar(crudo, via);
}
