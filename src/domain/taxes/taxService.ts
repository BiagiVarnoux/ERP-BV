import { supabase } from '@/integrations/supabase/client';
import { logAuditEntry } from '@/services/auditService';
import { round2 } from '@/accounting/utils';
import { calcularBaseEIva, periodoDeFecha } from './calc';
import { borrarArchivoFactura, subirArchivoFactura, type ArchivoFactura } from './taxDocStorage';
import type {
  CreateTaxDocumentInput, CxPPendienteFiscal, TaxDocTipo, TaxDocumentRow,
  UpdateTaxDocumentInput, VentaPendienteFiscal,
} from './types';

// `tax_documents` y `payables.sin_credito_fiscal` aún no están en los tipos
// generados de Supabase: el escape de tipos queda acotado a este único helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedQuery = any;
const from = (tabla: string): UntypedQuery => supabase.from(tabla as UntypedQuery) as UntypedQuery;

const table = () => from('tax_documents');

const PAGE = 1000;

/** Rango [desde, hasta] de fechas de un período YYYY-MM. */
function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const [y, m] = periodo.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimoDia).padStart(2, '0')}` };
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Documentos de un libro. `periodo` undefined trae todos los períodos.
 * Paginado: un libro anual puede pasar las 1000 filas que corta PostgREST.
 */
export async function listTaxDocuments(
  companyId: string,
  tipo: TaxDocTipo,
  periodo?: string,
): Promise<TaxDocumentRow[]> {
  if (!companyId) return [];
  const out: TaxDocumentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = table()
      .select('*')
      .eq('company_id', companyId)
      .eq('tipo', tipo);
    if (periodo) q = q.eq('periodo', periodo);
    const { data, error } = await q
      .order('fecha', { ascending: true })
      .order('numero_factura', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as TaxDocumentRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Períodos que ya tienen documentos cargados, del más reciente al más antiguo. */
export async function listPeriodosConDocumentos(companyId: string, tipo: TaxDocTipo): Promise<string[]> {
  if (!companyId) return [];
  const { data, error } = await table()
    .select('periodo')
    .eq('company_id', companyId)
    .eq('tipo', tipo);
  if (error) throw new Error(error.message);
  const set = new Set<string>((data ?? []).map((r: { periodo: string }) => r.periodo));
  return [...set].sort().reverse();
}

/**
 * ¿Este asiento ya generó una fila del libro fiscal? Se consulta antes de
 * ofrecer el modal del Libro Diario, para no cargar la misma factura dos veces
 * al reeditar un asiento ya procesado.
 */
export async function hasTaxDocumentForEntry(companyId: string, journalEntryId: string): Promise<boolean> {
  if (!companyId || !journalEntryId) return false;
  const { data, error } = await table()
    .select('id')
    .eq('company_id', companyId)
    .eq('journal_entry_id', journalEntryId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Busca duplicados del mismo documento: mismo NIT + mismo nº de factura.
 * El SIN rechaza el crédito fiscal de una factura declarada dos veces, así que
 * esto se consulta antes de guardar. `excluirId` permite editar sin auto-chocar.
 */
export async function buscarDuplicados(
  companyId: string,
  tipo: TaxDocTipo,
  nit: string | null,
  numeroFactura: string | null,
  excluirId?: string,
): Promise<TaxDocumentRow[]> {
  if (!companyId || !numeroFactura?.trim()) return [];
  let q = table()
    .select('*')
    .eq('company_id', companyId)
    .eq('tipo', tipo)
    .eq('numero_factura', numeroFactura.trim())
    .neq('estado', 'anulada');
  if (nit?.trim()) q = q.eq('nit', nit.trim());
  else q = q.is('nit', null);
  if (excluirId) q = q.neq('id', excluirId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TaxDocumentRow[];
}

// ─── Escritura ────────────────────────────────────────────────────────────────

function normalizar(input: CreateTaxDocumentInput, companyId: string, userId: string | null) {
  const { base_imponible, iva } = calcularBaseEIva(input);
  return {
    company_id:          companyId,
    user_id:             userId,
    tipo:                input.tipo,
    fecha:               input.fecha,
    periodo:             input.periodo ?? periodoDeFecha(input.fecha),
    nit:                 input.nit?.trim() || null,
    razon_social:        input.razon_social.trim(),
    tipo_documento:      input.tipo_documento ?? 'factura',
    numero_factura:      input.numero_factura?.trim() || null,
    numero_autorizacion: input.numero_autorizacion?.trim() || null,
    codigo_control:      input.codigo_control?.trim() || null,
    numero_declaracion:  input.numero_declaracion?.trim() || null,
    importe_total:       round2(input.importe_total),
    importe_ice:         round2(input.importe_ice ?? 0),
    importe_exento:      round2(input.importe_exento ?? 0),
    descuentos:          round2(input.descuentos ?? 0),
    base_imponible,
    alicuota:            input.alicuota ?? 13,
    iva,
    usa_iva_manual:      input.iva_manual != null,
    con_derecho_credito: input.tipo === 'compra' ? (input.con_derecho_credito ?? true) : true,
    sale_id:             input.sale_id ?? null,
    payable_id:          input.payable_id ?? null,
    journal_entry_id:    input.journal_entry_id ?? null,
    notas:               input.notas?.trim() || null,
  };
}

export async function createTaxDocument(
  input: CreateTaxDocumentInput,
  companyId: string,
): Promise<TaxDocumentRow> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  const { data: { user } } = await supabase.auth.getUser();
  const row = normalizar(input, companyId, user?.id ?? null);

  const { data, error } = await table().insert(row).select().single();
  if (error) throw new Error(error.message);

  const created = data as TaxDocumentRow;
  await logAuditEntry('tax_documents', created.id, 'INSERT', null, {
    tipo: created.tipo,
    periodo: created.periodo,
    numero_factura: created.numero_factura,
    nit: created.nit,
    importe_total: created.importe_total,
    iva: created.iva,
  });
  return created;
}

/** Alta masiva (importación desde Ventas / CxP). Devuelve las filas creadas. */
export async function createTaxDocuments(
  inputs: CreateTaxDocumentInput[],
  companyId: string,
): Promise<TaxDocumentRow[]> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  if (inputs.length === 0) return [];
  const { data: { user } } = await supabase.auth.getUser();
  const rows = inputs.map(i => normalizar(i, companyId, user?.id ?? null));

  const { data, error } = await table().insert(rows).select();
  if (error) throw new Error(error.message);

  const created = (data ?? []) as TaxDocumentRow[];
  for (const c of created) {
    await logAuditEntry('tax_documents', c.id, 'INSERT', null, {
      tipo: c.tipo, periodo: c.periodo, origen: c.sale_id ? 'venta' : c.payable_id ? 'cxp' : 'manual',
      importe_total: c.importe_total, iva: c.iva,
    });
  }
  return created;
}

export async function updateTaxDocument(
  id: string,
  patch: UpdateTaxDocumentInput,
  companyId: string,
): Promise<TaxDocumentRow> {
  if (!companyId) throw new Error('Empresa activa no resuelta');

  // Leemos la fila actual (scope de empresa) para recalcular importes y auditar.
  const { data: actual, error: errGet } = await table()
    .select('*').eq('id', id).eq('company_id', companyId).single();
  if (errGet) throw new Error(errGet.message);
  const antes = actual as TaxDocumentRow;

  const fecha = patch.fecha ?? antes.fecha;
  const merged: CreateTaxDocumentInput = {
    tipo:                antes.tipo,
    fecha,
    periodo:             patch.periodo ?? (patch.fecha ? periodoDeFecha(fecha) : antes.periodo),
    nit:                 patch.nit ?? antes.nit,
    razon_social:        patch.razon_social ?? antes.razon_social,
    tipo_documento:      patch.tipo_documento ?? antes.tipo_documento,
    numero_factura:      patch.numero_factura ?? antes.numero_factura,
    numero_autorizacion: patch.numero_autorizacion ?? antes.numero_autorizacion,
    codigo_control:      patch.codigo_control ?? antes.codigo_control,
    numero_declaracion:  patch.numero_declaracion ?? antes.numero_declaracion,
    importe_total:       patch.importe_total ?? antes.importe_total,
    importe_ice:         patch.importe_ice ?? antes.importe_ice,
    importe_exento:      patch.importe_exento ?? antes.importe_exento,
    descuentos:          patch.descuentos ?? antes.descuentos,
    alicuota:            patch.alicuota ?? antes.alicuota,
    // Si la fila guardaba un IVA propio del documento (DIM), se conserva salvo
    // que la edición mande uno nuevo — nunca se vuelve a derivar por su cuenta.
    iva_manual:          patch.iva_manual !== undefined
                           ? patch.iva_manual
                           : (antes.usa_iva_manual ? antes.iva : null),
    con_derecho_credito: patch.con_derecho_credito ?? antes.con_derecho_credito,
    notas:               patch.notas ?? antes.notas,
  };
  const row = normalizar(merged, companyId, antes.user_id);
  // Los enlaces con el resto del ERP no se editan desde el formulario.
  delete (row as Record<string, unknown>).sale_id;
  delete (row as Record<string, unknown>).payable_id;
  delete (row as Record<string, unknown>).journal_entry_id;
  delete (row as Record<string, unknown>).company_id;
  delete (row as Record<string, unknown>).user_id;

  const { data, error } = await table()
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)      // defensa en profundidad (S1)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAuditEntry('tax_documents', id, 'UPDATE', antes as unknown as Record<string, unknown>, row);
  return data as TaxDocumentRow;
}

/**
 * Sube el archivo de la factura y guarda su referencia en la fila. Se llama
 * DESPUÉS de crear el documento, porque la ruta del bucket lleva su id.
 */
export async function adjuntarArchivoAFactura(
  file: File,
  companyId: string,
  taxDocumentId: string,
): Promise<ArchivoFactura> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  const archivo = await subirArchivoFactura(file, companyId, taxDocumentId);
  const { error } = await table()
    .update({ ...archivo, updated_at: new Date().toISOString() })
    .eq('id', taxDocumentId)
    .eq('company_id', companyId);          // defensa en profundidad (S1)
  if (error) throw new Error(error.message);
  return archivo;
}

/** Anula fiscalmente el documento: deja de computar en el libro pero queda el rastro. */
export async function anularTaxDocument(id: string, companyId: string, motivo?: string): Promise<void> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  const { error } = await table()
    .update({ estado: 'anulada', notas: motivo?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  await logAuditEntry('tax_documents', id, 'UPDATE', { estado: 'vigente' }, { estado: 'anulada', motivo: motivo ?? null });
}

export async function deleteTaxDocument(id: string, companyId: string): Promise<void> {
  if (!companyId) throw new Error('Empresa activa no resuelta');

  // Se lee la ruta del adjunto antes de borrar la fila, para no dejar el
  // archivo huérfano en el bucket.
  const { data: fila } = await table()
    .select('archivo_path').eq('id', id).eq('company_id', companyId).maybeSingle();

  const { error } = await table().delete().eq('id', id).eq('company_id', companyId);
  if (error) throw new Error(error.message);

  const path = (fila as { archivo_path?: string | null } | null)?.archivo_path;
  if (path) {
    // Si el borrado del binario falla, la fila ya se fue: se avisa y sigue.
    try {
      await borrarArchivoFactura(path);
    } catch (e) {
      console.warn('No se pudo borrar el archivo de la factura:', e);
    }
  }

  await logAuditEntry('tax_documents', id, 'DELETE', null, null);
}

// ─── Importación asistida ─────────────────────────────────────────────────────

/** Asientos que ya tienen una factura en el libro (por el modal del Diario). */
async function asientosYaEnLibro(companyId: string): Promise<Set<string>> {
  const { data, error } = await table()
    .select('journal_entry_id')
    .eq('company_id', companyId)
    .not('journal_entry_id', 'is', null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { journal_entry_id: string }) => r.journal_entry_id));
}

/**
 * Ventas con factura del período que todavía no están en el Libro de Ventas.
 * Las anuladas (`voided`) quedan fuera: su factura se anula por nota de crédito.
 */
export async function listVentasPendientes(
  companyId: string,
  periodo: string,
): Promise<VentaPendienteFiscal[]> {
  if (!companyId) return [];
  const { desde, hasta } = rangoPeriodo(periodo);

  const { data, error } = await from('sales')
    .select('id, numero, fecha, cliente_nombre, total_cobrado, total_iva, journal_entry_id')
    .eq('company_id', companyId)
    .eq('con_factura', true)
    .eq('estado', 'confirmed')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) throw new Error(error.message);

  const ventas = (data ?? []) as VentaPendienteFiscal[];
  if (ventas.length === 0) return [];

  const { data: yaCargadas, error: errYa } = await table()
    .select('sale_id')
    .eq('company_id', companyId)
    .not('sale_id', 'is', null);
  if (errYa) throw new Error(errYa.message);

  const cargadas = new Set((yaCargadas ?? []).map((r: { sale_id: string }) => r.sale_id));
  const asientosUsados = await asientosYaEnLibro(companyId);
  return ventas.filter(v =>
    !cargadas.has(v.id) && !(v.journal_entry_id && asientosUsados.has(v.journal_entry_id)));
}

/**
 * CxP del período candidatas al Libro de Compras: ni cargadas ya, ni descartadas
 * por el usuario con `sin_credito_fiscal`. Nada se importa solo: la selección
 * la hace siempre el usuario, porque no toda CxP es una factura con crédito fiscal.
 */
export async function listCxPPendientes(
  companyId: string,
  periodo: string,
): Promise<CxPPendienteFiscal[]> {
  if (!companyId) return [];
  const { desde, hasta } = rangoPeriodo(periodo);

  const { data, error } = await from('payables')
    .select('id, numero_documento, fecha_emision, proveedor_nombre, proveedor_nit, monto_original, moneda, journal_entry_id')
    .eq('company_id', companyId)
    .eq('sin_credito_fiscal', false)
    .neq('estado', 'voided')
    .gte('fecha_emision', desde)
    .lte('fecha_emision', hasta)
    .order('fecha_emision', { ascending: true });
  if (error) throw new Error(error.message);

  const cxp = (data ?? []) as CxPPendienteFiscal[];
  if (cxp.length === 0) return [];

  const { data: yaCargadas, error: errYa } = await table()
    .select('payable_id')
    .eq('company_id', companyId)
    .not('payable_id', 'is', null);
  if (errYa) throw new Error(errYa.message);

  const cargadas = new Set((yaCargadas ?? []).map((r: { payable_id: string }) => r.payable_id));
  const asientosUsados = await asientosYaEnLibro(companyId);
  return cxp.filter(p =>
    !cargadas.has(p.id) && !(p.journal_entry_id && asientosUsados.has(p.journal_entry_id)));
}

/** Marca (o desmarca) una CxP como obligación sin factura, para sacarla del importador. */
export async function marcarCxPSinCreditoFiscal(
  payableId: string,
  companyId: string,
  valor: boolean,
): Promise<void> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  const { error } = await from('payables')
    .update({ sin_credito_fiscal: valor })
    .eq('id', payableId)
    .eq('company_id', companyId);          // defensa en profundidad (S1)
  if (error) throw new Error(error.message);
  await logAuditEntry('payables', payableId, 'UPDATE',
    { sin_credito_fiscal: !valor }, { sin_credito_fiscal: valor });
}
