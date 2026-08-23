// src/lib/share-url.ts
// Enlaces internos para compartir un recurso (análisis de inversión, licitación)
// o uno de sus productos. No dan acceso por sí solos: quien abra el enlace
// necesita sesión y permiso de vista sobre el módulo.

/**
 * @param basePath ruta interna del recurso, ej. `/investments/<id>`
 * @param itemId   producto a resaltar dentro del recurso (opcional)
 */
export function buildShareUrl(basePath: string, opts?: { itemId?: string }): string {
  const url = new URL(basePath, window.location.origin);
  if (opts?.itemId) url.searchParams.set('item', opts.itemId);
  return url.toString();
}
