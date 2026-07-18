// src/accounting/product-foto-storage.ts
// Fotos de producto para el Catálogo de Ventas. Varias "sesiones" de fotos por
// producto (ej. fondo blanco, uso real). Mismo patrón que licitacion-storage.ts:
// tabla dedicada `product_fotos` + bucket `product-photos`.
import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';

export interface ProductFoto {
  id: string;
  product_id: string;
  sesion_id: string;
  sesion_nombre: string | null;
  path: string;
  nombre: string;
  size?: number;
  sort_order: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface FotoSesion {
  sesion_id: string;
  sesion_nombre: string | null;
  fotos: ProductFoto[];
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  return user;
}

function rowToFoto(row: Record<string, unknown>): ProductFoto {
  return {
    id: row.id as string,
    product_id: row.product_id as string,
    sesion_id: row.sesion_id as string,
    sesion_nombre: (row.sesion_nombre as string) || null,
    path: row.path as string,
    nombre: row.nombre as string,
    size: row.size != null ? Number(row.size) : undefined,
    sort_order: Number(row.sort_order) || 0,
    uploaded_by: row.uploaded_by as string,
    uploaded_at: row.uploaded_at as string,
  };
}

function groupBySesion(fotos: ProductFoto[]): FotoSesion[] {
  const bySesion = new Map<string, FotoSesion>();
  for (const foto of fotos) {
    let grupo = bySesion.get(foto.sesion_id);
    if (!grupo) {
      grupo = { sesion_id: foto.sesion_id, sesion_nombre: foto.sesion_nombre, fotos: [] };
      bySesion.set(foto.sesion_id, grupo);
    }
    grupo.fotos.push(foto);
  }
  return Array.from(bySesion.values());
}

export const ProductFotoStorage = {
  async listFotos(productId: string): Promise<FotoSesion[]> {
    const { data, error } = await supabase
      .from('product_fotos')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order');
    if (error) throw error;
    return groupBySesion((data || []).map(r => rowToFoto(r as Record<string, unknown>)));
  },

  async uploadFotos(productId: string, sesionNombre: string | null, files: File[]): Promise<FotoSesion> {
    const user = await getUser();
    const companyId = await resolveUserCompanyId();
    const sesionId = crypto.randomUUID();

    const rows: ProductFoto[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const path = `${companyId}/${productId}/${sesionId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('product-photos').upload(path, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('product_fotos')
        .insert({
          product_id: productId,
          company_id: companyId,
          sesion_id: sesionId,
          sesion_nombre: sesionNombre,
          path,
          nombre: file.name,
          size: file.size,
          sort_order: i,
          uploaded_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      rows.push(rowToFoto(data as Record<string, unknown>));
    }

    return { sesion_id: sesionId, sesion_nombre: sesionNombre, fotos: rows };
  },

  async deleteFoto(foto: ProductFoto): Promise<void> {
    const { error: storageErr } = await supabase.storage.from('product-photos').remove([foto.path]);
    if (storageErr) console.warn('[deleteFoto] Storage remove failed:', storageErr.message);
    const { error } = await supabase.from('product_fotos').delete().eq('id', foto.id);
    if (error) throw error;
  },

  async deleteSesion(sesion: FotoSesion): Promise<void> {
    const paths = sesion.fotos.map(f => f.path);
    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage.from('product-photos').remove(paths);
      if (storageErr) console.warn('[deleteSesion] Storage remove failed:', storageErr.message);
    }
    const { error } = await supabase.from('product_fotos').delete().eq('sesion_id', sesion.sesion_id);
    if (error) throw error;
  },

  async getFotoUrl(path: string): Promise<string> {
    const { data } = await supabase.storage.from('product-photos').createSignedUrl(path, 3600);
    return data?.signedUrl ?? '';
  },

  /** Batch de URLs firmadas en una sola llamada de red (en vez de una por foto). */
  async getFotoUrls(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    const { data, error } = await supabase.storage.from('product-photos').createSignedUrls(paths, 3600);
    if (error) throw error;
    return (data ?? []).map(d => d.signedUrl ?? '');
  },
};
