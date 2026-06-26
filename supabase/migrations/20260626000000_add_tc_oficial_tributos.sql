-- Tras la flexibilización del tipo de cambio en Bolivia, los tributos aduaneros
-- (Gravamen Arancelario + IVA aduanero) ya no se calculan al T/C oficial fijo (6.97).
-- Se agrega un T/C aduanero configurable en Licitaciones y Análisis de Inversión:
--   · A nivel de cabecera (licitaciones / investment_analyses): default de toda la
--     cotización/análisis. DEFAULT 6.97 para preservar el comportamiento histórico.
--   · A nivel de producto (override opcional, NULL = hereda el de la cabecera).
-- Embarques NO se toca: ya tiene shipments.tc_oficial como campo manual por embarque.
--
-- Operación NO destructiva: solo añade columnas. Las filas existentes obtienen 6.97
-- en la cabecera (idéntico al cálculo anterior) y NULL en los productos (heredan 6.97).

ALTER TABLE public.licitaciones
  ADD COLUMN IF NOT EXISTS tc_oficial numeric DEFAULT 6.97;

ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS tc_oficial numeric;

ALTER TABLE public.investment_analyses
  ADD COLUMN IF NOT EXISTS tc_oficial numeric DEFAULT 6.97;

ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS tc_oficial numeric;

COMMENT ON COLUMN public.licitaciones.tc_oficial IS
  'T/C por defecto para tributos aduaneros (GA + IVA) de toda la cotización. NULL/ausente = 6.97.';
COMMENT ON COLUMN public.licitacion_productos.tc_oficial IS
  'Override de T/C aduanero por producto. NULL = hereda el de la licitación.';
COMMENT ON COLUMN public.investment_analyses.tc_oficial IS
  'T/C por defecto para tributos aduaneros (GA + IVA) de todo el análisis. NULL/ausente = 6.97.';
COMMENT ON COLUMN public.investment_analysis_items.tc_oficial IS
  'Override de T/C aduanero por producto del análisis. NULL = hereda el del análisis.';
