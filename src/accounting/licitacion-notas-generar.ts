// src/accounting/licitacion-notas-generar.ts
// Genera las 4 notas de licitación en .docx (jszip) y PDF (jsPDF) a partir de:
// config de empresa + datos del proceso (DBC) + productos del cotizador + overrides
// por licitación. Un solo modelo de contenido alimenta ambos renderers.

import JSZip from 'jszip';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadBlob } from '@/lib/open-url';
import { fmt } from '@/accounting/utils';
import type { Licitacion } from '@/accounting/licitacion-types';
import {
  type NotaTipo, type NotasEmpresaConfig, type LicitacionNotasDatos,
  NOTA_LABELS, NOTA_CITE_NRO, leerNotasDatos,
} from '@/accounting/licitacion-notas';

// ─── Modelo de contenido ──────────────────────────────────────────────────────

type Bloque =
  | { k: 'p'; texto: string; bold?: boolean; align?: 'left' | 'center' | 'right' }
  | { k: 'tabla'; headers: string[]; rows: string[][]; numCols?: number[] }
  | { k: 'sp' };

interface NotaDoc {
  titulo: string;
  filename: string;   // sin extensión
  bloques: Bloque[];
}

interface ItemResuelto {
  nro: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  cantGarantia: number;
  precio: number;
  total: number;
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaPartes(iso: string): { dia: number; mes: string; anio: number } | null {
  const d = iso ? new Date(iso + 'T12:00:00') : null;
  if (!d || isNaN(d.getTime())) return null;
  return { dia: d.getDate(), mes: MESES[d.getMonth()], anio: d.getFullYear() };
}
function fechaLarga(iso: string): string {
  const p = fechaPartes(iso);
  return p ? `${p.dia} de ${p.mes} de ${p.anio}` : '';
}
const bs = (n: number) => `Bs ${fmt(n)}`;

function joinY(xs: string[]): string {
  const v = xs.filter(Boolean);
  if (v.length === 0) return '';
  if (v.length === 1) return v[0];
  return `${v.slice(0, -1).join(', ')} y ${v[v.length - 1]}`;
}

function slug(s: string): string {
  return (s || 'nota').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'nota';
}

// ─── Resolución de datos ──────────────────────────────────────────────────────

function resolverItems(lic: Licitacion, datos: LicitacionNotasDatos): ItemResuelto[] {
  return lic.productos.map(p => {
    const o = datos.items[p.id] ?? { nro_dbc: '', descripcion: '', unidad: '', cant_garantia: null };
    const cantidad = Number(p.cantidad) || 0;
    const precio = Number(p.precio_ofertado) || 0;
    return {
      nro: o.nro_dbc || '',
      descripcion: o.descripcion || '',
      unidad: o.unidad || '',
      cantidad,
      cantGarantia: o.cant_garantia != null ? o.cant_garantia : cantidad,
      precio,
      total: cantidad * precio,
    };
  });
}

interface Ctx {
  config: NotasEmpresaConfig;
  objeto: string;
  cuce: string;
  entidad: string;
  datos: LicitacionNotasDatos;
  items: ItemResuelto[];
}

function ctxDe(lic: Licitacion, config: NotasEmpresaConfig): Ctx {
  const datos = leerNotasDatos(lic.datos_ia as Record<string, unknown>);
  const proceso = (lic.datos_ia as Record<string, unknown>)?.proceso as
    { objeto_contratacion?: string; cuce?: string; entidad_convocante?: string } | undefined;
  return {
    config,
    objeto: proceso?.objeto_contratacion || '',
    cuce: proceso?.cuce || '',
    entidad: proceso?.entidad_convocante || '',
    datos,
    items: resolverItems(lic, datos),
  };
}

// ─── Construcción de cada nota ────────────────────────────────────────────────

function cite(tipo: NotaTipo, c: Ctx): string | null {
  const nn = NOTA_CITE_NRO[tipo];
  if (!nn) return null;
  const anio = fechaPartes(c.datos.fecha)?.anio ?? new Date().getFullYear();
  const mm = c.datos.nro_licitacion_anual || '—';
  return `${c.config.cite_prefijo} Nº ${nn}-${mm}/${anio}`;
}

function ciudadDe(c: Ctx): string {
  return c.datos.ciudad.trim() || c.config.ciudad.trim();
}

function encabezado(tipo: NotaTipo, c: Ctx, ref: string): Bloque[] {
  const b: Bloque[] = [];
  const ci = cite(tipo, c);
  const cf = `${ciudadDe(c)}, ${fechaLarga(c.datos.fecha)}`.replace(/^, /, '').replace(/, $/, '');
  if (cf.trim()) b.push({ k: 'p', texto: cf, align: 'right' });
  if (ci) b.push({ k: 'p', texto: ci, align: 'right' });
  b.push({ k: 'sp' });
  b.push({ k: 'p', texto: c.datos.tratamiento || 'Señor(es):' });
  if (c.datos.destinatario_nombre) b.push({ k: 'p', texto: c.datos.destinatario_nombre, bold: true });
  if (c.datos.destinatario_cargo) b.push({ k: 'p', texto: c.datos.destinatario_cargo });
  if (c.datos.destinatario_reparticion) b.push({ k: 'p', texto: c.datos.destinatario_reparticion });
  b.push({ k: 'p', texto: 'Presente.-' });
  b.push({ k: 'sp' });
  b.push({ k: 'p', texto: `Ref.- ${ref}`, bold: true });
  b.push({ k: 'sp' });
  return b;
}

function introBase(c: Ctx, accion: string): string {
  const itemsStr = joinY(c.items.map(i => i.nro));
  const rep = c.config.representante || '[representante]';
  const rol = c.config.rol || 'propietario';
  const emp = c.config.empresa || '[empresa]';
  const partes = [`Mediante la presente, yo, ${rep}, ${rol} de ${emp}, ${accion} del proceso de contratación`];
  let s = partes.join(' ');
  s += ` “${c.objeto || '[objeto]'}”`;
  if (itemsStr) s += `, de los ítems “${itemsStr}”`;
  s += `, con número CUCE: ${c.cuce || '[CUCE]'}`;
  return s;
}

function firma(c: Ctx): Bloque[] {
  return [
    { k: 'sp' },
    { k: 'sp' },
    { k: 'p', texto: c.config.representante || '', bold: true, align: 'center' },
    { k: 'p', texto: c.config.empresa || '', align: 'center' },
    ...(c.config.nit ? [{ k: 'p' as const, texto: `NIT: ${c.config.nit}`, align: 'center' as const }] : []),
  ];
}

function buildEntregaDocumentos(c: Ctx): NotaDoc {
  const b = encabezado('entrega_documentos', c, 'CONSTANCIA DE ENTREGA DE DOCUMENTOS');
  b.push({ k: 'p', texto: `${introBase(c, 'proponente adjudicado')}, dejo constancia de la entrega de los siguientes documentos:` });
  b.push({ k: 'sp' });
  for (const d of c.config.documentos) b.push({ k: 'p', texto: `•  ${d}` });
  b.push(...firma(c));
  return { titulo: NOTA_LABELS.entrega_documentos, filename: `01-entrega-documentos-${slug(c.entidad)}`, bloques: b };
}

function buildNotaEntrega(c: Ctx): NotaDoc {
  const b = encabezado('nota_entrega', c, 'NOTA DE ENTREGA');
  b.push({ k: 'p', texto: `${introBase(c, 'adjudicatario')}, dejo constancia de la entrega de los siguientes bienes:` });
  b.push({ k: 'sp' });
  b.push({
    k: 'tabla',
    headers: ['ÍTEM', 'DESCRIPCIÓN', 'UNIDAD DE MEDIDA', 'CANTIDAD'],
    rows: c.items.map(i => [i.nro, i.descripcion, i.unidad, String(i.cantidad)]),
  });
  b.push({ k: 'sp' });
  b.push({ k: 'p', texto: 'Asimismo, se deja constancia de que los bienes entregados son nuevos, se encuentran debidamente sellados y en perfecto estado de conservación. Los mismos han sido verificados y probados, constatándose que se encuentran en correcto estado de funcionamiento y que la totalidad de los bienes entregados son funcionales y cumplen con las condiciones requeridas.' });
  b.push({ k: 'p', texto: 'La presente Nota de Entrega se emite como constancia de la entrega, verificación y conformidad respecto al estado y funcionamiento de los bienes señalados.' });
  b.push(...firma(c));
  return { titulo: NOTA_LABELS.nota_entrega, filename: `02-nota-entrega-${slug(c.entidad)}`, bloques: b };
}

function buildGarantia(c: Ctx): NotaDoc {
  // La garantía NO lleva CITE ni encabezado de destinatario.
  const b: Bloque[] = [];
  b.push({ k: 'p', texto: 'GARANTÍA', bold: true, align: 'center' });
  b.push({ k: 'sp' });
  const favor = c.datos.destinatario_reparticion || c.entidad || '[entidad]';
  b.push({ k: 'p', texto: `${introBase(c, 'adjudicatario')}, otorgo la presente garantía a favor de la “${favor}”, por la entrega de los siguientes bienes:` });
  b.push({ k: 'sp' });
  b.push({
    k: 'tabla',
    headers: ['ÍTEM', 'DESCRIPCIÓN', 'UNIDAD DE MEDIDA', 'CANTIDAD'],
    rows: c.items.map(i => [i.nro, i.descripcion, i.unidad, String(i.cantGarantia)]),
  });
  b.push({ k: 'sp' });
  b.push({ k: 'p', texto: 'Plazo de la garantía: el bien cuenta con una garantía de seis (6) meses a partir de la fecha de entrega.' });
  b.push({ k: 'p', texto: 'Alcance de la garantía: la presente garantía cubre exclusivamente defectos de fabricación que impidan el normal funcionamiento del bien.' });
  b.push({ k: 'p', texto: 'Exclusiones: la garantía no cubre daños ocasionados por uso inadecuado o distinto al recomendado por el fabricante; golpes, caídas, derrame de líquidos, manipulación indebida o intervención por personal no autorizado; ni problemas derivados de fallas eléctricas externas o mal manejo del bien.' });
  b.push({ k: 'p', texto: 'En caso de presentarse algún defecto de fabricación durante el periodo de garantía, el proveedor se compromete a realizar el cambio o reparación correspondiente sin costo adicional para la institución.' });
  const p = fechaPartes(c.datos.fecha);
  if (p) {
    b.push({ k: 'sp' });
    b.push({ k: 'p', texto: `En constancia de lo expuesto, suscribo la presente en ${ciudadDe(c)}, a los ${p.dia} días del mes de ${p.mes} del ${p.anio}.` });
  }
  b.push(...firma(c));
  return { titulo: NOTA_LABELS.garantia, filename: `garantia-${slug(c.entidad)}`, bloques: b };
}

function buildSolicitudPago(c: Ctx): NotaDoc {
  const b = encabezado('solicitud_pago', c, 'SOLICITUD DE CANCELACIÓN');
  b.push({ k: 'p', texto: `${introBase(c, 'adjudicatario')}, solicito el pago correspondiente a los siguientes bienes:` });
  b.push({ k: 'sp' });
  const rows = c.items.map(i => [i.nro, i.descripcion, String(i.cantidad), bs(i.precio), bs(i.total)]);
  const totalGeneral = c.items.reduce((s, i) => s + i.total, 0);
  rows.push(['', '', '', 'TOTAL', bs(totalGeneral)]);
  b.push({
    k: 'tabla',
    headers: ['ÍTEM', 'DESCRIPCIÓN', 'CANTIDAD', 'PRECIO', 'TOTAL'],
    rows,
    numCols: [2, 3, 4],
  });
  b.push({ k: 'sp' });
  b.push({ k: 'p', texto: `A efectos del depósito correspondiente, pongo a disposición la siguiente información:` });
  b.push({ k: 'p', texto: `•  Cuenta Bancaria: ${c.config.cuenta || '[cuenta]'}` });
  b.push({ k: 'p', texto: `•  Entidad Bancaria: ${c.config.banco || '[banco]'}` });
  b.push({ k: 'p', texto: 'La cuenta indicada se encuentra debidamente registrada en el SICOES y en el certificado SIGEP, en el cual consta dicha información.' });
  b.push({ k: 'p', texto: 'Sin otro particular, agradezco la atención prestada y quedo a la espera de la confirmación respectiva.' });
  b.push(...firma(c));
  return { titulo: NOTA_LABELS.solicitud_pago, filename: `03-solicitud-pago-${slug(c.entidad)}`, bloques: b };
}

export function construirNota(tipo: NotaTipo, lic: Licitacion, config: NotasEmpresaConfig): NotaDoc {
  const c = ctxDe(lic, config);
  switch (tipo) {
    case 'entrega_documentos': return buildEntregaDocumentos(c);
    case 'nota_entrega':       return buildNotaEntrega(c);
    case 'garantia':           return buildGarantia(c);
    case 'solicitud_pago':     return buildSolicitudPago(c);
  }
}

// ─── Render .docx (WordprocessingML mínimo, vía jszip) ─────────────────────────

const esc = (s: string) => (s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function runXml(texto: string, bold?: boolean): string {
  // Soporta saltos de línea internos con <w:br/>.
  const parts = (texto || '').split('\n');
  const t = parts.map((p, i) => (i > 0 ? '<w:br/>' : '') + `<w:t xml:space="preserve">${esc(p)}</w:t>`).join('');
  return `<w:r><w:rPr>${bold ? '<w:b/>' : ''}</w:rPr>${t}</w:r>`;
}

function parXml(texto: string, bold?: boolean, align?: string): string {
  const jc = align && align !== 'left' ? `<w:jc w:val="${align === 'right' ? 'right' : align}"/>` : '';
  return `<w:p><w:pPr>${jc}</w:pPr>${runXml(texto, bold)}</w:p>`;
}

function cellXml(texto: string, bold?: boolean): string {
  return `<w:tc><w:tcPr><w:tcBorders>` +
    `<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>` +
    `</w:tcBorders></w:tcPr>${parXml(texto, bold)}</w:tc>`;
}

function tableXml(headers: string[], rows: string[][]): string {
  const head = `<w:tr>${headers.map(h => cellXml(h, true)).join('')}</w:tr>`;
  const body = rows.map(r => `<w:tr>${r.map(c => cellXml(c)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>` +
    `<w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>` +
    `</w:tblPr>${head}${body}</w:tbl>`;
}

function bloquesXml(bloques: Bloque[]): string {
  return bloques.map(b => {
    if (b.k === 'sp') return parXml('');
    if (b.k === 'p') return parXml(b.texto, b.bold, b.align);
    return tableXml(b.headers, b.rows);
  }).join('');
}

export async function notaADocxBlob(nota: NotaDoc): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`);
  zip.folder('_rels')!.file('.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`);
  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    bloquesXml(nota.bloques) +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr>` +
    `</w:body></w:document>`;
  zip.folder('word')!.file('document.xml', doc);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function descargarNotaDocx(nota: NotaDoc): Promise<void> {
  const blob = await notaADocxBlob(nota);
  downloadBlob(blob, `${nota.filename}.docx`);
}

// ─── Render PDF (jsPDF) ───────────────────────────────────────────────────────

export function descargarNotaPdf(nota: NotaDoc): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 56;                       // margen
  const W = doc.internal.pageSize.getWidth();
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M; }
  };

  for (const b of nota.bloques) {
    if (b.k === 'sp') { y += 10; continue; }
    if (b.k === 'tabla') {
      autoTable(doc, {
        startY: y,
        head: [b.headers],
        body: b.rows,
        margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [66, 66, 66], textColor: 255 },
        columnStyles: (b.numCols ?? []).reduce((acc, ci) => { acc[ci] = { halign: 'right' }; return acc; }, {} as Record<number, { halign: 'right' }>),
      });
      const fin = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      y = (fin ?? y) + 8;
      continue;
    }
    doc.setFont('helvetica', b.bold ? 'bold' : 'normal');
    doc.setFontSize(b.bold ? 12 : 11);
    const lines = doc.splitTextToSize(b.texto, maxW) as string[];
    const lh = b.bold ? 15 : 14;
    for (const ln of lines) {
      ensure(lh);
      const x = b.align === 'right' ? W - M : b.align === 'center' ? W / 2 : M;
      doc.text(ln, x, y, { align: b.align === 'right' ? 'right' : b.align === 'center' ? 'center' : 'left' });
      y += lh;
    }
  }

  downloadBlob(doc.output('blob'), `${nota.filename}.pdf`);
}
