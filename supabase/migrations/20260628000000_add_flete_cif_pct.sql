-- % del flete que se computa en la base CIF para los tributos aduaneros.
-- Solo una fracción del costo de envío entra al valor aduanero (≈10% aéreo,
-- ≈25% marítimo); el resto sigue siendo costo real del producto pero NO tributa.
--
-- Se define a nivel de cabecera (licitación / análisis) y cada producto puede
-- sobreescribirlo. DEFAULT 10 (aéreo), que es el caso habitual de la empresa.
--
-- Operación NO destructiva: solo añade columnas.

ALTER TABLE public.licitaciones
  ADD COLUMN IF NOT EXISTS flete_cif_pct numeric DEFAULT 10;

ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS flete_cif_pct numeric;

ALTER TABLE public.investment_analyses
  ADD COLUMN IF NOT EXISTS flete_cif_pct numeric DEFAULT 10;

ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS flete_cif_pct numeric;

COMMENT ON COLUMN public.licitaciones.flete_cif_pct IS
  '% del flete computable en la base CIF (10 aéreo / 25 marítimo). NULL = 10.';
COMMENT ON COLUMN public.licitacion_productos.flete_cif_pct IS
  'Override del % de flete en CIF por producto. NULL = hereda el de la licitación.';
COMMENT ON COLUMN public.investment_analyses.flete_cif_pct IS
  '% del flete computable en la base CIF (10 aéreo / 25 marítimo). NULL = 10.';
COMMENT ON COLUMN public.investment_analysis_items.flete_cif_pct IS
  'Override del % de flete en CIF por producto. NULL = hereda el del análisis.';
