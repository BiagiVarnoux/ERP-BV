-- Módulo: Condición de producto + Categorías de inventario + SKU auto-generado
-- Añade:
--   1. Tabla product_categories (categorías gestionadas por empresa)
--   2. Columnas condicion, category_id, tipo_inventario en products

-- ─── 1. product_categories ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_categories (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nombre     text        NOT NULL,
  codigo     char(3)     NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, codigo)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_all" ON public.product_categories
  FOR ALL
  USING (
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

-- ─── 2. Nuevas columnas en products ──────────────────────────────────────────

-- condicion: estado del producto (nuevo, reacondicionado_*, usado)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS condicion text;

-- category_id: FK a product_categories (puede ser null para productos sin categoría)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- tipo_inventario: ELE | PED | LIC — prefijo del SKU, se elige al crear/importar
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tipo_inventario text;
