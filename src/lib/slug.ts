// src/lib/slug.ts
// Slugs legibles para las URLs de recursos compartibles (licitaciones y análisis
// de inversión). El slug se deriva del nombre, es único POR EMPRESA y respalda
// las URLs bonitas tipo `/licitaciones/ministerio-de-la-presidencia-98-ssds`.
//
// La unicidad final la garantiza el índice `(company_id, slug)` en la BD; aquí
// solo evitamos colisiones de forma optimista consultando los slugs ya usados.

import { supabase } from '@/integrations/supabase/client';

/** Normaliza un texto a `[a-z0-9-]`, sin tildes. Nunca devuelve cadena vacía. */
export function slugify(input: string | null | undefined): string {
  const s = (input ?? '')
    .normalize('NFD')                 // separa las tildes de la letra base
    .replace(/[̀-ͯ]/g, '')  // elimina los diacríticos (á→a, ñ→n, ç→c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')      // todo lo demás → guion
    .replace(/^-+|-+$/g, '');         // sin guiones al inicio/fin
  return s || 'item';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿El parámetro de la URL es un UUID (link viejo) o un slug? */
export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type SlugTable = 'licitaciones' | 'investment_analyses';

/**
 * Genera un slug único dentro de la empresa a partir del nombre. Si el slug base
 * ya está tomado agrega sufijo `-2`, `-3`, … Se excluye `excludeId` para que al
 * renombrar un recurso conserve su propio slug base en vez de auto-colisionar.
 */
export async function generateUniqueSlug(
  table: SlugTable,
  companyId: string,
  nombre: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(nombre);
  const { data, error } = await supabase
    .from(table)
    .select('id, slug')
    .eq('company_id', companyId)
    .like('slug', `${base}%`);
  if (error) throw error;

  const taken = new Set(
    (data ?? [])
      .filter((r: { id: string; slug: string | null }) => r.id !== excludeId && r.slug)
      .map((r: { slug: string | null }) => r.slug as string),
  );

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
