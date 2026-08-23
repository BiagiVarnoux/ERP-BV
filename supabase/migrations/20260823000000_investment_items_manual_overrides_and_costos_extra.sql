-- Overrides manuales (GA, IVA aduana, flete, manipuleo) y costos extra
-- con nombre libre por producto del análisis de inversión.
-- Espeja lo que ya existe en licitacion_productos, más una lista flexible de
-- costos adicionales que NO se comparte entre productos.

ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS ga_manual_es_total        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iva_manual_es_total       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flete_manual              numeric,
  ADD COLUMN IF NOT EXISTS usa_flete_manual          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flete_manual_es_total     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manipuleo_manual          numeric,
  ADD COLUMN IF NOT EXISTS usa_manipuleo_manual      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manipuleo_manual_es_total boolean NOT NULL DEFAULT false,
  -- [{ id: uuid, nombre: text, monto: number }] — costos propios del producto
  ADD COLUMN IF NOT EXISTS costos_extra              jsonb NOT NULL DEFAULT '[]'::jsonb;
