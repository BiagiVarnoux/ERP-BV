-- Archivo de la factura (PDF o imagen) adjunto a la fila del libro fiscal.
-- ⚠️ Los binarios viven en Storage y NO se incluyen en el backup JSON — misma
-- limitación documentada para shipment-docs / licitacion-files. Solo viaja la
-- referencia (archivo_path).
ALTER TABLE public.tax_documents
  ADD COLUMN IF NOT EXISTS archivo_path   text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text,
  ADD COLUMN IF NOT EXISTS archivo_mime   text,
  ADD COLUMN IF NOT EXISTS archivo_size   integer;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tax-docs', 'tax-docs', false, 20971520,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Rutas: {company_id}/{tax_document_id}/{archivo}. A diferencia de los buckets
-- antiguos (que dejan leer a cualquier usuario autenticado), aquí el primer
-- segmento de la ruta se valida contra las empresas del usuario: un miembro de
-- otra empresa no puede leer ni escribir estas facturas.
DROP POLICY IF EXISTS "tax_docs_company_member_select" ON storage.objects;
CREATE POLICY "tax_docs_company_member_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'tax-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT cm.company_id::text FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tax_docs_company_member_insert" ON storage.objects;
CREATE POLICY "tax_docs_company_member_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tax-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT cm.company_id::text FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tax_docs_company_member_delete" ON storage.objects;
CREATE POLICY "tax_docs_company_member_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'tax-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT cm.company_id::text FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );
