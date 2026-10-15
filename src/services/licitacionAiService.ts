// src/services/licitacionAiService.ts
// Extracción del CRONOGRAMA DE PLAZOS de un DBC boliviano (.docx).
// Flujo: extraer texto del .docx (preservando celdas/filas) → localizar y limpiar
// la ventana del cronograma → parsear en código (plantilla estándar SICOES) →
// si el parser no detecta filas, caer al modelo Groq via edge function ai-dbc.
//
// Alcance intencional (acotado por decisión de producto): por ahora SOLO se extrae
// el cronograma y SOLO desde .docx. Las demás extracciones (fechas sueltas, precio
// referencial, requisitos) se retomarán cuando el cronograma esté sólido; sus
// columnas en la tabla se conservan, solo dejamos de escribirlas desde el análisis.

import { supabase } from '@/integrations/supabase/client';

// ─── Tipos ──────────────────────────────────────────────────────────────────

// Actividad canónica del Cronograma de Plazos. SICOES usa una plantilla estándar:
// siempre las mismas actividades y en el mismo orden. Una licitación puede traer
// todas, algunas o ninguna. 'otro' = fila no reconocida (se conserva como texto).
export type CronogramaKey =
  | 'publicacion_dbc' | 'inspeccion_previa' | 'consultas_escritas' | 'reunion_aclaracion'
  | 'presentacion_propuestas' | 'inicio_subasta' | 'cierre_subasta' | 'apertura_propuestas'
  | 'informe_evaluacion' | 'adjudicacion' | 'notificacion_adjudicacion'
  | 'presentacion_docs' | 'suscripcion_contrato' | 'otro';

export interface CronogramaItem {
  key?: CronogramaKey; // actividad canónica detectada (o 'otro')
  nro: number | null;
  actividad: string;
  fecha: string;   // 'YYYY-MM-DD' o '' si no corresponde / no hay
  hora: string;    // 'HH:MM' o ''
}

export interface DbcExtraccion {
  cronograma: CronogramaItem[];
  plazo_entrega_dias?: number | null; // de la sección "PLAZO DE ENTREGA" del DBC
}

/** Fechas clave del proceso derivadas del cronograma (para la pestaña Proceso). */
export interface FechasDesdeCronograma {
  fecha_presentacion?: string;
  fecha_adjudicacion_est?: string;
  fecha_contrato?: string;
}

const VENTANA_CHARS = 4500;

// ─── Catálogo fijo de actividades (plantilla estándar SICOES) ─────────────────

export interface CronogramaActividadDef {
  key: Exclude<CronogramaKey, 'otro'>;
  label: string;
  test: (nombreMinuscula: string) => boolean;
}

// Orden = orden de la tabla del DBC. `test` recibe el nombre YA en minúsculas.
export const CRONOGRAMA_CATALOGO: CronogramaActividadDef[] = [
  { key: 'publicacion_dbc',          label: 'Publicación del DBC en el SICOES',               test: n => /publicaci[oó]n/.test(n) && /(dbc|sicoes)/.test(n) },
  { key: 'inspeccion_previa',        label: 'Inspección previa',                               test: n => /inspecci[oó]n/.test(n) },
  { key: 'consultas_escritas',       label: 'Consultas escritas',                              test: n => /consultas?/.test(n) },
  { key: 'reunion_aclaracion',       label: 'Reunión informativa de aclaración',               test: n => /reuni[oó]n/.test(n) && /(aclaraci[oó]n|informativa)/.test(n) },
  { key: 'presentacion_propuestas',  label: 'Presentación de Propuestas',                      test: n => /presentaci[oó]n/.test(n) && /propuesta/.test(n) },
  { key: 'inicio_subasta',           label: 'Inicio de Subasta Electrónica',                   test: n => /inicio/.test(n) && /subasta/.test(n) },
  { key: 'cierre_subasta',           label: 'Cierre preliminar de Subasta Electrónica',        test: n => /cierre/.test(n) && /subasta/.test(n) },
  { key: 'apertura_propuestas',      label: 'Apertura de Propuestas',                          test: n => /apertura/.test(n) && /propuesta/.test(n) },
  { key: 'informe_evaluacion',       label: 'Informe de Evaluación y Recomendación al RPA',    test: n => /informe/.test(n) && /evaluaci[oó]n/.test(n) },
  { key: 'adjudicacion',             label: 'Adjudicación o Declaratoria Desierta',            test: n => /(adjudicaci[oó]n|declaratoria desierta)/.test(n) && !/notificaci[oó]n/.test(n) },
  { key: 'notificacion_adjudicacion',label: 'Notificación de la adjudicación',                 test: n => /notificaci[oó]n/.test(n) && /(adjudicaci[oó]n|declaratoria)/.test(n) },
  { key: 'presentacion_docs',        label: 'Presentación de documentos para la formalización', test: n => /presentaci[oó]n/.test(n) && /documento/.test(n) && /(formalizaci[oó]n|contrataci[oó]n)/.test(n) },
  { key: 'suscripcion_contrato',     label: 'Suscripción de Contrato / Orden de Compra',       test: n => /(suscripci[oó]n de contrato|orden de compra)/.test(n) },
];

export const CRONOGRAMA_LABELS: Record<CronogramaKey, string> = {
  ...Object.fromEntries(CRONOGRAMA_CATALOGO.map(d => [d.key, d.label])),
  otro: 'Otra actividad',
} as Record<CronogramaKey, string>;

/** Clasifica el nombre de una actividad contra el catálogo fijo. */
export function clasificarActividad(nombre: string): CronogramaKey {
  const n = (nombre || '').toLowerCase();
  for (const d of CRONOGRAMA_CATALOGO) if (d.test(n)) return d.key;
  return 'otro';
}

/** Posición de orden de una key (1..13); las 'otro'/desconocidas van al final. */
export function cronogramaOrden(key?: CronogramaKey): number {
  if (!key || key === 'otro') return 99;
  const i = CRONOGRAMA_CATALOGO.findIndex(d => d.key === key);
  return i < 0 ? 99 : i + 1;
}

/** Asegura que cada ítem tenga `key` (clasifica los que no la traigan, p. ej. legados). */
export function conKeys(cronograma: CronogramaItem[]): CronogramaItem[] {
  return cronograma.map(it => ({ ...it, key: it.key ?? clasificarActividad(it.actividad) }));
}

// ─── Mapeo cronograma → fechas clave del proceso ─────────────────────────────

/**
 * Deriva las fechas clave de la pestaña Proceso a partir del cronograma, usando la
 * actividad canónica (key); para ítems legados sin key, clasifica por el nombre.
 *   - fecha_presentacion     ← presentacion_propuestas
 *   - fecha_adjudicacion_est ← adjudicacion
 *   - fecha_contrato         ← suscripcion_contrato
 */
export function mapearCronogramaAFechas(cronograma: CronogramaItem[]): FechasDesdeCronograma {
  const out: FechasDesdeCronograma = {};
  const keyOf = (it: CronogramaItem) => it.key ?? clasificarActividad(it.actividad);
  const fechaDe = (k: CronogramaKey) => cronograma.find(it => it.fecha && keyOf(it) === k)?.fecha;

  const pres = fechaDe('presentacion_propuestas');
  const adj  = fechaDe('adjudicacion');
  const cont = fechaDe('suscripcion_contrato');
  if (pres) out.fecha_presentacion = pres;
  if (adj)  out.fecha_adjudicacion_est = adj;
  if (cont) out.fecha_contrato = cont;
  return out;
}

// ─── Plazo de entrega (sección aparte del DBC) ───────────────────────────────

/**
 * Extrae el plazo de entrega de los BIENES (en días) de la sección "PLAZO DE
 * ENTREGA" del DBC. OJO: hay un "plazo de entrega de documentos" en el boilerplate
 * legal que NO es este; por eso exigimos el encabezado seguido en la línea siguiente
 * por "N días" (así se descarta el de documentos, que va seguido de "de documentos…").
 * Requiere el texto COMPLETO del DBC (no la ventana del cronograma).
 */
export function extraerPlazoEntregaDias(textoCompleto: string): number | null {
  const m = /(?:^|\n)\s*(?:[A-Z]\.\s*)?PLAZO\s+DE\s+ENTREGA\s*:?\s*\n?\s*(\d{1,3})\s*d[ií]as?/i.exec(textoCompleto);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : null;
}

// ─── Extracción de texto del .docx ──────────────────────────────────────────

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
 * Extrae el texto COMPLETO de un .docx preservando el orden y los límites de las
 * celdas/filas de las tablas: inserta ' | ' al cerrar cada celda (</w:tc>) y un
 * salto de línea al cerrar cada fila (</w:tr>). Esto es imprescindible para que
 * los dígitos día/mes/año/hora/min del cronograma queden en su fila y en orden.
 *
 * Los runs de texto (<w:t>) se unen SIN separador extra: Word ya guarda los
 * espacios significativos dentro del propio run, y meter un espacio por run
 * inyectaría espacios dentro de palabras partidas en varios runs (rompería el
 * ancla "Cronograma de Plazos:").
 *
 * Devuelve el texto completo (sin recortar): la tabla del cronograma puede estar
 * al 60% del documento, muy por detrás de cualquier recorte por primeros-N-chars.
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

        const out: string[] = [];
        const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<\/w:tc>|<\/w:tr>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tokenRe.exec(xml)) !== null) {
          if (tm[1] !== undefined)      out.push(tm[1]);  // texto del run
          else if (tm[0] === '</w:tc>') out.push(' | ');  // fin de celda
          else if (tm[0] === '</w:tr>') out.push('\n');   // fin de fila
        }

        return out.join('')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
          .replace(/[ \t]+/g, ' ')
          .replace(/ *\| */g, ' | ')
          .replace(/\s*\|\s*\n/g, '\n')   // "|" colgante al final de una fila
          .replace(/ *\n */g, '\n')
          .trim();
      }

      // Avanzar siempre al menos más allá de este entry (previene loop infinito con compSize=0)
      offset = Math.max(dataEnd, offset + 30 + nameLen + extraLen + 1);
    } else {
      // Saltar hasta el próximo 'PK' en lugar de avanzar byte a byte (O(n) vs O(n²))
      let next = offset + 1;
      while (next < bytes.length - 1 && !(bytes[next] === 0x50 && bytes[next + 1] === 0x4B)) next++;
      offset = next;
    }
  }
  return '';
}

// ─── Localización + limpieza de la ventana del cronograma ────────────────────

/**
 * Localiza el "Cronograma de Plazos" en el texto COMPLETO del DBC y devuelve una
 * ventana limpia (~VENTANA_CHARS chars) lista para parsear o enviar al modelo.
 *
 * - Ancla: la frase con dos puntos "Cronograma de Plazos:" (la frase suelta
 *   aparece mucho en prosa legal; por eso exigimos los dos puntos). Respaldo: la
 *   cabecera de la tabla ACTIVIDAD … FECHA … HORA.
 * - Corta al inicio de la sección siguiente ("(*) Los plazos…" o
 *   "ESPECIFICACIONES TÉCNICAS") para no arrastrar el resto del DBC.
 * - Colapsa celdas vacías consecutivas ' |  |  | ' → ' | ': la tabla de SICOES
 *   intercala muchas celdas vacías entre los dígitos de la fecha.
 *
 * Devuelve '' si no encuentra el cronograma.
 */
export function extraerVentanaCronograma(texto: string): string {
  const m = /Cronograma\s+de\s+Plazos\s*:/i.exec(texto)
         ?? /ACTIVIDAD[\s|]*FECHA[\s|]*HORA/i.exec(texto);
  if (!m) return '';

  const rest = texto.slice(m.index);
  const end  = /\(\*\)\s*Los plazos|ESPECIFICACIONES T[ÉE]CNICAS/i.exec(rest);
  const win  = end ? rest.slice(0, end.index) : rest.slice(0, VENTANA_CHARS);

  return win
    .replace(/\n/g, ' \n ')             // proteger saltos de fila al colapsar
    .replace(/(?: *\| *){2,}/g, ' | ')  // celdas vacías consecutivas → una
    .replace(/\n *\| */g, '\n')         // "|" al inicio de línea
    .replace(/ *\| *\n/g, '\n')         // "|" al final de línea
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ─── Parser determinista (plantilla estándar SICOES) ─────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Rearma el cronograma desde la ventana limpia, sin IA.
 *
 * La tabla de SICOES pone cada actividad en DOS filas: una de rótulos
 * ("N | actividad | Día | Mes | Año [ | Hora | Min. ]") y la siguiente con los
 * valores ("30 | 07 | 2026 [ | 08 | 30 ] | <texto de lugar>"). Tomamos los 3
 * primeros números como día/mes/año y, si el rótulo trae "Hora | Min.", los dos
 * siguientes como hora/min. "No corresponde" ⇒ fecha y hora vacías.
 *
 * Devuelve [] si el texto no sigue esta plantilla (ahí entra el respaldo Groq).
 */
export function parseCronogramaLocal(ventana: string): CronogramaItem[] {
  const lines = ventana.split('\n');
  const labelRe = /^(\d{1,2})\s*\|\s*(.+?)\s*\|\s*D[íi]a\b/i;
  const items: CronogramaItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lm = labelRe.exec(lines[i]);
    if (!lm) continue;

    const nro       = parseInt(lm[1], 10);
    const actividad = lm[2].trim();
    const tieneHora = /Hora\s*\|\s*Min/i.test(lines[i]);
    const val       = (lines[i + 1] || '').trim();

    let fecha = '';
    let hora  = '';

    if (!/No\s+corresponde/i.test(val)) {
      const nums = val.split('|').map(s => s.trim())
        .filter(s => /^\d{1,4}$/.test(s)).map(Number);
      if (nums.length >= 3) {
        const [d, mo, y] = nums;
        if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          fecha = `${y}-${pad2(mo)}-${pad2(d)}`;
        }
      }
      if (tieneHora && nums.length >= 5) {
        const h = nums[3], mi = nums[4];
        if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) hora = `${pad2(h)}:${pad2(mi)}`;
      }
    }

    items.push({
      key: clasificarActividad(actividad),
      nro: Number.isFinite(nro) ? nro : null,
      actividad, fecha, hora,
    });
  }

  return items;
}

// ─── Respaldo: modelo Groq (edge function ai-dbc) ────────────────────────────

/**
 * Envía la ventana del cronograma al edge function ai-dbc (Groq) y normaliza la
 * respuesta. Se usa SOLO cuando el parser determinista no detecta filas.
 */
export async function analizarDbc(dbcText: string): Promise<DbcExtraccion> {
  const { data, error } = await supabase.functions.invoke('ai-dbc', {
    body: { dbcText },
  });

  if (error) throw new Error(error.message || 'Error al llamar al agente IA');
  if (data?.error) throw new Error(data.error);

  const items = Array.isArray(data?.extraction?.cronograma) ? data.extraction.cronograma : [];
  const cronograma: CronogramaItem[] = items.map((it: Record<string, unknown>) => {
    const actividad = String(it?.actividad ?? '').trim();
    return {
      key:       clasificarActividad(actividad),
      nro:       typeof it?.nro === 'number' ? it.nro : null,
      actividad,
      fecha:     typeof it?.fecha === 'string' ? it.fecha.trim() : '',
      hora:      typeof it?.hora  === 'string' ? it.hora.trim()  : '',
    };
  });
  return { cronograma };
}
