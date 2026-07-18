-- La política RLS de product_fotos validaba pertenencia leyendo `products`
-- (product_id IN (SELECT id FROM products WHERE company_id IN ...)). Al
-- endurecer el RLS SELECT de `products` (migración 20260718000005), un
-- vendedor con permiso "solo ver" en catalogo_ventas dejó de poder leer
-- `products` directo, así que ese subquery devolvía vacío y NO veía ninguna
-- foto — tenía que darle permisos extra (que además le mostraban las
-- pestañas de gestión) para que las fotos aparecieran.
--
-- Fix: darle a product_fotos su propio company_id (como manda la regla de
-- multi-empresa) y validar la política por company_id directo, sin depender
-- del RLS de products. Las fotos son material de marketing que el vendedor
-- SÍ debe ver — basta con ser miembro de la empresa.
ALTER TABLE public.product_fotos
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.product_fotos pf
SET company_id = p.company_id
FROM public.products p
WHERE p.id = pf.product_id AND pf.company_id IS NULL;

ALTER TABLE public.product_fotos ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_fotos_company ON public.product_fotos(company_id);

DROP POLICY IF EXISTS "company_member_all" ON public.product_fotos;
CREATE POLICY "company_member_all" ON public.product_fotos
  FOR ALL USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );
