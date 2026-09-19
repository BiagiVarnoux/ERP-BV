-- Orden manual de las tarjetas de Análisis de Inversión (drag & drop en la lista).
-- Se rellena respetando el orden actual de pantalla (created_at desc) por empresa.

ALTER TABLE public.investment_analyses
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0;

WITH numerados AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC) - 1) AS n
  FROM public.investment_analyses
)
UPDATE public.investment_analyses a
SET orden = numerados.n
FROM numerados
WHERE numerados.id = a.id;

CREATE INDEX IF NOT EXISTS investment_analyses_company_orden_idx
  ON public.investment_analyses (company_id, orden);
