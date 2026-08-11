-- Override manual (Bs) de flete/envío y manipuleo en el cotizador de
-- licitaciones: reemplazan el cálculo por peso × tarifa con un monto directo
-- en Bs. Cada uno puede ser por unidad o total (todas las unidades), como el
-- GA/IVA manual.
ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS flete_manual               numeric(18,2),
  ADD COLUMN IF NOT EXISTS usa_flete_manual           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flete_manual_es_total      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manipuleo_manual           numeric(18,2),
  ADD COLUMN IF NOT EXISTS usa_manipuleo_manual       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manipuleo_manual_es_total  boolean NOT NULL DEFAULT false;
