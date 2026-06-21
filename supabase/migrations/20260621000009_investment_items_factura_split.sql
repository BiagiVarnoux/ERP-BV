-- Soporte para venta mixta con/sin factura por producto del análisis.
-- precio_venta (existente) = precio CON factura.
-- precio_venta_sin_factura = precio SIN factura (normalmente menor).
-- cantidad_sin_factura     = unidades que se venden sin factura (el resto, con factura).
-- Con cantidad_sin_factura = 0 el comportamiento es idéntico al anterior.
ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS precio_venta_sin_factura numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_sin_factura     numeric NOT NULL DEFAULT 0;
