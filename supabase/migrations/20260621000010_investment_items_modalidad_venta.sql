-- Modalidad de venta por producto del análisis: define qué precio maneja el
-- análisis (con o sin factura).
--   'con_factura' (default) → ingreso = precio_venta × cantidad, paga IVA + IT.
--   'sin_factura'           → ingreso = precio_venta_sin_factura × cantidad, sin IVA ni IT.
-- El precio de la otra modalidad queda como referencia (y ancla del precio
-- con factura sugerido).
ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS modalidad_venta text NOT NULL DEFAULT 'con_factura'
    CHECK (modalidad_venta IN ('con_factura','sin_factura'));
