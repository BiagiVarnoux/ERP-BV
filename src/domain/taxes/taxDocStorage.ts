// Archivos de factura del libro fiscal — bucket `tax-docs`.
// Rutas: {company_id}/{tax_document_id}/{archivo}. El primer segmento es lo que
// valida la política de Storage, así que SIEMPRE debe ser la empresa activa.
//
// ⚠️ Los binarios NO viajan en el backup JSON (misma limitación documentada para
// shipment-docs y licitacion-files): el backup guarda solo `archivo_path`.
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'tax-docs';

export interface ArchivoFactura {
  archivo_path: string;
  archivo_nombre: string;
  archivo_mime: string;
  archivo_size: number;
}

/** Quita acentos y caracteres raros: Storage solo acepta nombres simples. */
function sanitizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);
}

/**
 * Sube el archivo de una factura ya registrada y devuelve los metadatos para
 * guardar en la fila. `upsert` permite reemplazar el adjunto de un documento.
 */
export async function subirArchivoFactura(
  file: File,
  companyId: string,
  taxDocumentId: string,
): Promise<ArchivoFactura> {
  if (!companyId) throw new Error('Empresa activa no resuelta');
  const path = `${companyId}/${taxDocumentId}/${Date.now()}-${sanitizarNombre(file.name)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir la factura: ${error.message}`);

  return {
    archivo_path: path,
    archivo_nombre: file.name,
    archivo_mime: file.type,
    archivo_size: file.size,
  };
}

/** URL firmada temporal para ver o descargar el archivo (el bucket es privado). */
export async function urlFirmadaFactura(path: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos);
  if (error || !data?.signedUrl) {
    throw new Error(`No se pudo abrir el archivo: ${error?.message ?? 'sin URL'}`);
  }
  return data.signedUrl;
}

/** Descarga el archivo como Blob, para guardarlo con su nombre original. */
export async function descargarArchivoFactura(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`No se pudo descargar el archivo: ${error?.message ?? 'sin contenido'}`);
  }
  return data;
}

/** Borra el archivo del bucket. Se llama al eliminar la fila del libro. */
export async function borrarArchivoFactura(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`No se pudo borrar el archivo: ${error.message}`);
}
