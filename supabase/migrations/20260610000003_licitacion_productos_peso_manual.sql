-- Cotizador: peso bruto alternativo + overrides manuales de GA e IVA aduana
-- Los campos son opcionales (nullable / default false) — retrocompatibles con filas existentes.

ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS peso_bruto         numeric,
  ADD COLUMN IF NOT EXISTS usa_peso_bruto     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ga_manual          numeric,
  ADD COLUMN IF NOT EXISTS usa_ga_manual      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iva_aduana_manual  numeric,
  ADD COLUMN IF NOT EXISTS usa_iva_manual     boolean NOT NULL DEFAULT false;
