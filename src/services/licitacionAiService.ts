// src/services/licitacionAiService.ts
// Extracción de texto de PDF y Word, y análisis con Groq via edge function ai-dbc.

import { supabase } from '@/integrations/supabase/client';

export interface DbcExtraccion {
  fecha_presentacion?:     string | null;
  fecha_adjudicacion_est?: string | null;
  fecha_contrato?:         string | null;
  plazo_entrega_dias?:     number | null;
  precio_referencial?:     number | null;
  requisitos_adicionales?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LIMITE_CHARS = 24_000;

/**
 * Busca "PARTE II" en el texto extraído y retorna solo desde ahí.
 * La Parte I de todo DBC boliviano es boilerplate legal idéntico — no nos interesa.
 * Si no encuentra el marcador, retorna el texto completo.
 */
function extraerParteII(texto: string): string {
  const marcadores = ['PARTE II', 'Parte II', 'PARTE  II', 'PARTE lI']; // lI = OCR fail común
  for (const m of marcadores) {
    const idx = texto.indexOf(m);
    if (idx !== -1) return texto.slice(idx);
  }
  return texto; // fallback: devolver todo si no hay marcador
}

// ─── Extracción de texto ──────────────────────────────────────────────────────

/**
 * Intenta extraer texto legible de un PDF digital (no funciona con escaneados).
 * Solo retorna texto si encuentra suficiente contenido; si no, devuelve vacío.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);

  const chunks: string[] = [];

  const btEtRegex = /BT\s([\s\S]{1,6000}?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btEtRegex.exec(latin1)) !== null) {
    const block = m[1];
    const strRegex = /\(([^)\\]{1,300}(?:\\.[^)\\]{0,300})*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(block)) !== null) {
      const s = sm[1]
        .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
        .trim();
      if (s.length > 2 && /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(s)) chunks.push(s);
    }
  }

  const raw = chunks.join(' ').replace(/\s+/g, ' ').trim();
  if (raw.length < 100) return ''; // PDF comprimido o escaneado

  const parteII = extraerParteII(raw);
  return parteII.slice(0, LIMITE_CHARS);
}

/**
 * Descomprime datos DEFLATE usando la API nativa del navegador.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds     = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/**
 * Extrae texto de un archivo Word (.docx).
 * Parsea el ZIP, descomprime word/document.xml, extrae etiquetas <w:t>.
 * Luego busca PARTE II y envía solo esa sección.
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let offset = 0;

  while (offset < bytes.length - 30) {
    if (
      bytes[offset]   === 0x50 && bytes[offset+1] === 0x4B &&
      bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04
    ) {
      const compression = bytes[offset+8]  | (bytes[offset+9]  << 8);
      const compSize    = bytes[offset+18] | (bytes[offset+19] << 8) |
                         (bytes[offset+20] << 16) | (bytes[offset+21] << 24);
      const nameLen     = bytes[offset+26] | (bytes[offset+27] << 8);
      const extraLen    = bytes[offset+28] | (bytes[offset+29] << 8);

      const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
      const entryName = new TextDecoder().decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd   = dataStart + compSize;

      if (entryName === 'word/document.xml') {
        const raw = bytes.subarray(dataStart, dataEnd);
        const xmlBytes = compression === 0 ? raw : await inflateRaw(raw);
        const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);

        // Extraer texto de etiquetas <w:t>
        const texts: string[] = [];
        const wt = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
        let wm: RegExpExecArray | null;
        while ((wm = wt.exec(xml)) !== null) {
          if (wm[1]) texts.push(wm[1]);
        }

        const full    = texts.join(' ').replace(/\s+/g, ' ').trim();
        const parteII = extraerParteII(full);
        return parteII.slice(0, LIMITE_CHARS);
      }

      offset = dataEnd > offset + 30 ? dataEnd : offset + 1;
    } else {
      // Saltar hasta el próximo 'PK' en lugar de avanzar byte a byte (O(n) vs O(n²))
      let next = offset + 1;
      while (next < bytes.length - 1 && !(bytes[next] === 0x50 && bytes[next + 1] === 0x4B)) next++;
      offset = next;
    }
  }
  return '';
}

// ─── Llamada al edge function ─────────────────────────────────────────────────

/**
 * Envía el texto del DBC al edge function ai-dbc (Groq) y devuelve la extracción.
 */
export async function analizarDbc(dbcText: string): Promise<DbcExtraccion> {
  const { data, error } = await supabase.functions.invoke('ai-dbc', {
    body: { dbcText },
  });

  if (error) throw new Error(error.message || 'Error al llamar al agente IA');
  if (data?.error) throw new Error(data.error);

  const ext = data?.extraction as DbcExtraccion | undefined;
  if (!ext) throw new Error('El agente no devolvió datos. Intenta de nuevo.');
  return ext;
}
