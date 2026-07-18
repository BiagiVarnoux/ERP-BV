-- Marca personal por vendedor de "ya publiqué este producto" en el Catálogo
-- de Ventas. Es estado PER-VENDEDOR (no compartido): cada usuario solo ve y
-- edita sus propias marcas. Por eso vive en tabla aparte y NO como columna de
-- products (que es compartida por toda la empresa).
CREATE TABLE public.product_publicaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  publicado   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE INDEX idx_product_publicaciones_user ON public.product_publicaciones(user_id, company_id);

ALTER TABLE public.product_publicaciones ENABLE ROW LEVEL SECURITY;

-- Cada quien solo ve/edita sus propias marcas (user_id = auth.uid()), con
-- scope de empresa por defensa en profundidad. No lee `products` (evita
-- depender del RLS endurecido de esa tabla, igual que product_fotos).
CREATE POLICY "own_marks" ON public.product_publicaciones
  FOR ALL USING (
    user_id = auth.uid()
    AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  );
