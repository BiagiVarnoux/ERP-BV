-- Permite ingresar el GA y el IVA aduana manual como TOTAL (por todas las
-- unidades del producto) además de por unidad. Los valores existentes eran
-- siempre por unidad, así que el default es false (por unidad) para no
-- reinterpretar cotizaciones ya cargadas.
ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS ga_manual_es_total  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iva_manual_es_total boolean NOT NULL DEFAULT false;
