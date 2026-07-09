// src/accounting/licitacion-storage.ts
// Persistencia del módulo de Licitaciones en Supabase

import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import {
  Licitacion, LicitacionProducto, LicitacionDoc,
  LicitacionEstado, TipoProceso,
} from './licitacion-types';

// ─── Helpers de autenticación ─────────────────────────────────────────────────

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  return user;
}

// ─── Conversores DB ↔ dominio ─────────────────────────────────────────────────

function rowToLicitacion(row: Record<string, unknown>): Licitacion {
  return {
    id:                    row.id as string,
    company_id:            row.company_id as string,
    user_id:               row.user_id as string,
    nombre:                (row.nombre as string) || '',
    entidad:               (row.entidad as string) || '',
    numero_sicoes:         (row.numero_sicoes as string) || '',
    tipo_proceso:          (row.tipo_proceso as TipoProceso) || 'ANPE',
    precio_referencial:    row.precio_referencial != null ? Number(row.precio_referencial) : undefined,
    tc_oficial:            row.tc_oficial != null ? Number(row.tc_oficial) : undefined,
    estado:                (row.estado as LicitacionEstado) || 'BORRADOR',
    fecha_presentacion:    (row.fecha_presentacion as string) || undefined,
    fecha_adjudicacion_est:(row.fecha_adjudicacion_est as string) || undefined,
    fecha_contrato:        (row.fecha_contrato as string) || undefined,
    plazo_entrega_dias:    row.plazo_entrega_dias != null ? Number(row.plazo_entrega_dias) : undefined,
    fecha_limite_entrega:  (row.fecha_limite_entrega as string) || undefined,
    fecha_entrega_real:    (row.fecha_entrega_real as string) || undefined,
    fecha_cobro:           (row.fecha_cobro as string) || undefined,
    embarque_id:           (row.embarque_id as string) || undefined,
    notas:                 (row.notas as string) || undefined,
    datos_ia:              (row.datos_ia as Record<string, unknown>) || {},
    productos:             [],
    documentos:            [],
    created_at:            row.created_at as string,
    updated_at:            row.updated_at as string,
  };
}

function rowToProducto(row: Record<string, unknown>): LicitacionProducto {
  return {
    id:              row.id as string,
    licitacion_id:   row.licitacion_id as string,
    orden:           Number(row.orden) || 0,
    nombre:          (row.nombre as string) || '',
    especificacion:  (row.especificacion as string) || undefined,
    link_producto:   (row.link_producto as string) || undefined,
    hs_code:         (row.hs_code as string) || undefined,
    cantidad:        Number(row.cantidad) || 1,
    tc:              Number(row.tc) || 9.97,
    tc_envio:        row.tc_envio != null ? Number(row.tc_envio) : undefined,
    tc_oficial:      row.tc_oficial != null ? Number(row.tc_oficial) : undefined,
    precio_usd:      Number(row.precio_usd) || 0,
    tax_pct:         Number(row.tax_pct) || 0,
    m1:                 row.m1 != null ? Number(row.m1) : undefined,
    m2:                 row.m2 != null ? Number(row.m2) : undefined,
    m3:                 row.m3 != null ? Number(row.m3) : undefined,
    peso_bruto:         row.peso_bruto != null ? Number(row.peso_bruto) : undefined,
    usa_peso_bruto:     Boolean(row.usa_peso_bruto),
    tarifa_envio:       Number(row.tarifa_envio) || 12,
    tarifa_manipuleo:   Number(row.tarifa_manipuleo) || 25,
    ga_pct:             Number(row.ga_pct) || 5,
    ga_manual:          row.ga_manual != null ? Number(row.ga_manual) : undefined,
    usa_ga_manual:      Boolean(row.usa_ga_manual),
    iva_aduana_manual:  row.iva_aduana_manual != null ? Number(row.iva_aduana_manual) : undefined,
    usa_iva_manual:     Boolean(row.usa_iva_manual),
    tiene_bateria:      Boolean(row.tiene_bateria),
    costo_bateria:   Number(row.costo_bateria) || 0,
    precio_entidad:  row.precio_entidad != null ? Number(row.precio_entidad) : undefined,
    precio_ofertado: Number(row.precio_ofertado) || 0,
    garantia:        Number(row.garantia) || 0,
    pasaje:          Number(row.pasaje) || 0,
    envio_local:     Number(row.envio_local) || 0,
    otros_costos:    Number(row.otros_costos) || 0,
    fuente:          (row.fuente as 'manual' | 'ia') || 'manual',
    created_at:      row.created_at as string,
    updated_at:      row.updated_at as string,
  };
}

function rowToDoc(row: Record<string, unknown>): LicitacionDoc {
  return {
    id:            row.id as string,
    licitacion_id: row.licitacion_id as string,
    categoria:     row.categoria as LicitacionDoc['categoria'],
    nombre:        row.nombre as string,
    path:          row.path as string,
    size:          row.size != null ? Number(row.size) : undefined,
    descripcion:   (row.descripcion as string) || undefined,
    uploaded_by:   (row.uploaded_by as string) || undefined,
    uploaded_at:   row.uploaded_at as string,
  };
}

// ─── LicitacionStorage ────────────────────────────────────────────────────────

export const LicitacionStorage = {

  // ── Lista ──────────────────────────────────────────────────────────────────

  async loadAll(): Promise<Licitacion[]> {
    const user = await getUser();
    const companyId = await resolveUserCompanyId();

    const { data, error } = await supabase
      .from('licitaciones')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(r => rowToLicitacion(r as Record<string, unknown>));
  },

  // ── Detalle completo (con productos y documentos) ──────────────────────────

  async loadOne(id: string): Promise<Licitacion> {
    const [litRes, prodsRes, docsRes] = await Promise.all([
      supabase.from('licitaciones').select('*').eq('id', id).single(),
      supabase.from('licitacion_productos').select('*').eq('licitacion_id', id).order('orden'),
      supabase.from('licitacion_documentos').select('*').eq('licitacion_id', id).order('uploaded_at'),
    ]);

    if (litRes.error) throw litRes.error;
    if (prodsRes.error) throw prodsRes.error;
    if (docsRes.error) throw docsRes.error;

    const lit = rowToLicitacion(litRes.data as Record<string, unknown>);
    lit.productos  = (prodsRes.data || []).map(r => rowToProducto(r as Record<string, unknown>));
    lit.documentos = (docsRes.data  || []).map(r => rowToDoc(r as Record<string, unknown>));
    return lit;
  },

  // ── Crear ──────────────────────────────────────────────────────────────────

  async create(lit: Omit<Licitacion, 'id' | 'company_id' | 'user_id' | 'created_at' | 'updated_at' | 'productos' | 'documentos'>): Promise<Licitacion> {
    const user = await getUser();
    const companyId = await resolveUserCompanyId();

    const { data, error } = await supabase
      .from('licitaciones')
      .insert({
        user_id:    user.id,
        company_id: companyId,
        ...lit,
        datos_ia: lit.datos_ia || {},
      })
      .select()
      .single();

    if (error) throw error;
    const result = rowToLicitacion(data as Record<string, unknown>);
    result.productos  = [];
    result.documentos = [];
    return result;
  },

  // ── Actualizar cabecera ────────────────────────────────────────────────────

  async update(id: string, changes: Partial<Omit<Licitacion, 'id' | 'company_id' | 'user_id' | 'productos' | 'documentos'>>): Promise<void> {
    const companyId = await resolveUserCompanyId();
    const { error } = await supabase
      .from('licitaciones')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  // ── Eliminar ───────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const companyId = await resolveUserCompanyId();
    const { error } = await supabase.from('licitaciones').delete().eq('id', id).eq('company_id', companyId);
    if (error) throw error;
  },

  // ─── Productos ─────────────────────────────────────────────────────────────

  async upsertProductos(productos: LicitacionProducto[]): Promise<void> {
    if (productos.length === 0) return;
    const companyId = await resolveUserCompanyId();
    // Verificar que todos los licitacion_id pertenecen a la empresa antes de upsertear (S2 IDOR)
    const licitacionIds = [...new Set(productos.map(p => p.licitacion_id))];
    const { data: owned, error: ownerErr } = await supabase
      .from('licitaciones')
      .select('id')
      .in('id', licitacionIds)
      .eq('company_id', companyId);
    if (ownerErr) throw ownerErr;
    const ownedIds = new Set((owned ?? []).map((r: any) => r.id));
    const safe = productos.filter(p => ownedIds.has(p.licitacion_id));
    if (safe.length === 0) return;
    const rows = safe.map(p => ({
      id:               p.id,
      licitacion_id:    p.licitacion_id,
      orden:            p.orden,
      nombre:           p.nombre,
      especificacion:   p.especificacion ?? null,
      link_producto:    p.link_producto ?? null,
      hs_code:          p.hs_code ?? null,
      cantidad:         p.cantidad,
      tc:               p.tc,
      tc_envio:         p.tc_envio ?? null,
      tc_oficial:       p.tc_oficial ?? null,
      precio_usd:       p.precio_usd,
      tax_pct:          p.tax_pct,
      m1:                  p.m1 ?? null,
      m2:                  p.m2 ?? null,
      m3:                  p.m3 ?? null,
      peso_bruto:          p.peso_bruto ?? null,
      usa_peso_bruto:      p.usa_peso_bruto,
      tarifa_envio:        p.tarifa_envio,
      tarifa_manipuleo:    p.tarifa_manipuleo,
      ga_pct:              p.ga_pct,
      ga_manual:           p.ga_manual ?? null,
      usa_ga_manual:       p.usa_ga_manual,
      iva_aduana_manual:   p.iva_aduana_manual ?? null,
      usa_iva_manual:      p.usa_iva_manual,
      tiene_bateria:       p.tiene_bateria,
      costo_bateria:    p.costo_bateria,
      precio_entidad:   p.precio_entidad ?? null,
      precio_ofertado:  p.precio_ofertado,
      garantia:         p.garantia,
      pasaje:           p.pasaje,
      envio_local:      p.envio_local,
      otros_costos:     p.otros_costos,
      fuente:           p.fuente,
    }));
    const { error } = await supabase.from('licitacion_productos').upsert(rows);
    if (error) throw error;
  },

  async deleteProducto(id: string, licitacionId: string): Promise<void> {
    // Filtrar por licitacion_id además del id para prevenir borrado de productos ajenos
    const { error } = await supabase
      .from('licitacion_productos')
      .delete()
      .eq('id', id)
      .eq('licitacion_id', licitacionId);
    if (error) throw error;
  },

  // ─── Documentos ────────────────────────────────────────────────────────────

  async uploadDoc(
    licitacionId: string,
    file: File,
    categoria: LicitacionDoc['categoria'],
    descripcion?: string,
  ): Promise<LicitacionDoc> {
    const user = await getUser();
    const ext  = file.name.split('.').pop();
    const path = `${user.id}/${licitacionId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('licitacion-files')
      .upload(path, file);
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('licitacion_documentos')
      .insert({
        licitacion_id: licitacionId,
        categoria,
        nombre:        file.name,
        path,
        size:          file.size,
        descripcion:   descripcion ?? null,
        uploaded_by:   user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return rowToDoc(data as Record<string, unknown>);
  },

  async deleteDoc(doc: LicitacionDoc): Promise<void> {
    // El fallo de Storage se loguea pero no bloquea el borrado del registro.
    // Un archivo huérfano es preferible a un registro zombie sin archivo.
    const { error: storageErr } = await supabase.storage.from('licitacion-files').remove([doc.path]);
    if (storageErr) console.warn('[deleteDoc] Storage remove failed:', storageErr.message);
    const { error } = await supabase.from('licitacion_documentos').delete().eq('id', doc.id);
    if (error) throw error;
  },

  async getDocUrl(path: string): Promise<string> {
    const { data } = await supabase.storage
      .from('licitacion-files')
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? '';
  },
};
