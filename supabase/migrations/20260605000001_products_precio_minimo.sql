-- Add configurable minimum price floor per product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS precio_minimo numeric(18,2);
