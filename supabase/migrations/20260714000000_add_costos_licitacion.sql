-- Costos de la licitación completa (no por producto): garantía, pasaje,
-- envío y otros costos que aplican una sola vez a todo el proceso de
-- contratación (ej. boleta de garantía), en vez de tener que repartirse
-- manualmente entre cada producto cotizado.

ALTER TABLE public.licitaciones
  ADD COLUMN IF NOT EXISTS garantia_licitacion      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pasaje_licitacion         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS envio_licitacion          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_costos_licitacion   numeric NOT NULL DEFAULT 0;
