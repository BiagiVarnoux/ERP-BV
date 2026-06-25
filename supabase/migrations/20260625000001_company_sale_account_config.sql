-- Configuración de mapeo tipo_pago → cuenta contable por empresa.
-- Permite que cada empresa personalice qué cuenta del plan de cuentas
-- corresponde a cada método de pago en el módulo de ventas,
-- sin necesidad de modificar el código.
CREATE TABLE IF NOT EXISTS public.company_sale_account_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id),
  tipo_pago    text        NOT NULL,
  account_codigo text      NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, tipo_pago)
);

ALTER TABLE public.company_sale_account_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_all" ON public.company_sale_account_config
  FOR ALL USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );
