-- "Tipo de inventario" (prefijo del SKU: ELE/PED/LIC) estaba hardcodeado a solo
-- 3 opciones en el frontend (src/accounting/product-condicion.ts), sin forma de
-- agregar tipos nuevos (ej. "Medicamentos") sin tocar código. Se mueve al mismo
-- patrón ya usado por product_categories: tabla configurable por empresa,
-- gestionable desde Ajustes.
--
-- products.tipo_inventario sigue siendo texto libre (sin cambios) — solo cambia
-- de dónde salen las opciones disponibles en los selectores.

CREATE TABLE IF NOT EXISTS public.product_tipos_inventario (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  valor      text        NOT NULL,   -- slug guardado en products.tipo_inventario (ej. 'electronica')
  nombre     text        NOT NULL,   -- label visible (ej. 'Electrónica')
  codigo     char(3)     NOT NULL,   -- prefijo del SKU (ej. 'ELE')
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, valor)
);

ALTER TABLE public.product_tipos_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_all" ON public.product_tipos_inventario
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

-- Sembrar los 3 tipos que ya existían hardcodeados, para cada empresa existente,
-- así los productos ya creados (cuyo tipo_inventario ya usa estos slugs) siguen
-- funcionando exactamente igual sin ninguna migración de datos.
INSERT INTO public.product_tipos_inventario (company_id, valor, nombre, codigo)
SELECT c.id, v.valor, v.nombre, v.codigo
FROM public.companies c
CROSS JOIN (VALUES
  ('electronica', 'Electrónica', 'ELE'),
  ('pedido',      'A Pedido',    'PED'),
  ('licitaciones','Licitaciones','LIC')
) AS v(valor, nombre, codigo)
ON CONFLICT (company_id, valor) DO NOTHING;
