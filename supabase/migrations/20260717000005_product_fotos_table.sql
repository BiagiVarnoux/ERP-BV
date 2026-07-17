-- Fotos de producto para el Catálogo de Ventas. Varias "sesiones" de fotos
-- por producto (ej. fondo blanco, uso real) agrupadas por sesion_id.
-- Sigue el mismo patrón que licitacion_documentos: tabla dedicada (no array
-- JSON como shipments) para poder hacer RLS y queries por fila.
CREATE TABLE public.product_fotos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sesion_id     uuid NOT NULL,
  sesion_nombre text,
  path          text NOT NULL,
  nombre        text NOT NULL,
  size          integer,
  sort_order    integer NOT NULL DEFAULT 0,
  uploaded_by   uuid NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_fotos_product ON public.product_fotos(product_id);
CREATE INDEX idx_product_fotos_sesion ON public.product_fotos(sesion_id);

ALTER TABLE public.product_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_all" ON public.product_fotos
  FOR ALL USING (
    product_id IN (
      SELECT p.id FROM public.products p
      WHERE p.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT p.id FROM public.products p
      WHERE p.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );

-- Bucket para los archivos de las fotos. Ruta: {company_id}/{product_id}/{sesion_id}/{uuid}.{ext}
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "company_member_all_product_photos" ON storage.objects
  FOR ALL USING (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );
