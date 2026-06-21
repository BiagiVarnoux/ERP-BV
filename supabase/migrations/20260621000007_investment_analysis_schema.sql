-- ════════════════════════════════════════════════════════════════════════════
-- Módulo: Análisis de Inversión / Evaluación de Importaciones (contabilidad gerencial)
-- Herramienta de SIMULACIÓN: no toca contabilidad ni inventario. Permite evaluar
-- la rentabilidad de comprar/importar productos antes de comprometer capital,
-- incluyendo la dimensión temporal (ciclo de caja, ROI anualizado, VAN/TIR).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Cabecera del análisis ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investment_analyses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id                  uuid,                       -- creador (referencia, no scope)
  nombre                   text NOT NULL DEFAULT '',
  notas                    text,
  -- Parámetros financieros del análisis
  costo_capital_anual      numeric NOT NULL DEFAULT 12,  -- % anual; tasa de descuento para VAN/TIR
  plazo_importacion_meses  numeric NOT NULL DEFAULT 1,   -- meses desde el pago hasta tener la mercadería en almacén
  estado                   text NOT NULL DEFAULT 'BORRADOR'
                           CHECK (estado IN ('BORRADOR','APROBADO','DESCARTADO','EJECUTADO')),
  embarque_id              text,                        -- set cuando se "envía a embarque"
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_analyses_company
  ON public.investment_analyses (company_id, created_at DESC);

-- ─── Productos del análisis ─────────────────────────────────────────────────
-- Reusa los mismos campos de costeo del cotizador de licitaciones + dimensión
-- de venta/tiempo (precio_venta, velocidad_venta).
CREATE TABLE IF NOT EXISTS public.investment_analysis_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         uuid NOT NULL REFERENCES public.investment_analyses(id) ON DELETE CASCADE,
  orden               integer NOT NULL DEFAULT 0,

  -- Descripción
  nombre              text NOT NULL DEFAULT '',
  especificacion      text,
  link_producto       text,
  hs_code             text,

  -- Cantidad y tipo de cambio
  cantidad            numeric NOT NULL DEFAULT 1,
  tc                  numeric NOT NULL DEFAULT 9.97,
  tc_envio            numeric,

  -- Compra
  precio_usd          numeric NOT NULL DEFAULT 0,
  tax_pct             numeric NOT NULL DEFAULT 0,

  -- Dimensiones / peso para flete
  m1                  numeric,
  m2                  numeric,
  m3                  numeric,
  peso_bruto          numeric,
  usa_peso_bruto      boolean NOT NULL DEFAULT false,
  tarifa_envio        numeric NOT NULL DEFAULT 12,
  tarifa_manipuleo    numeric NOT NULL DEFAULT 25,

  -- Tributos aduaneros
  ga_pct              numeric NOT NULL DEFAULT 5,
  ga_manual           numeric,
  usa_ga_manual       boolean NOT NULL DEFAULT false,
  iva_aduana_manual   numeric,
  usa_iva_manual      boolean NOT NULL DEFAULT false,

  -- Batería
  tiene_bateria       boolean NOT NULL DEFAULT false,
  costo_bateria       numeric NOT NULL DEFAULT 0,

  -- Venta esperada (driver de rentabilidad)
  precio_venta        numeric NOT NULL DEFAULT 0,    -- precio de venta esperado Bs/unidad

  -- Costos adicionales
  garantia            numeric NOT NULL DEFAULT 0,
  pasaje              numeric NOT NULL DEFAULT 0,
  envio_local         numeric NOT NULL DEFAULT 0,
  otros_costos        numeric NOT NULL DEFAULT 0,

  -- Dimensión temporal de la venta
  velocidad_venta     numeric NOT NULL DEFAULT 0,    -- unidades/mes estimadas
  meses_venta_override numeric,                      -- si se fija manualmente el plazo de venta (meses)

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_items_analysis
  ON public.investment_analysis_items (analysis_id, orden);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.investment_analyses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_analysis_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_member_all" ON public.investment_analyses;
CREATE POLICY "company_member_all" ON public.investment_analyses
  FOR ALL USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "company_member_all" ON public.investment_analysis_items;
CREATE POLICY "company_member_all" ON public.investment_analysis_items
  FOR ALL USING (
    analysis_id IN (
      SELECT a.id FROM public.investment_analyses a
      WHERE a.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    analysis_id IN (
      SELECT a.id FROM public.investment_analyses a
      WHERE a.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );
