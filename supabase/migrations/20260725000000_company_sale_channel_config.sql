-- Canales de venta configurables por empresa.
-- Antes los 4 canales (licitacion/electronica/pedido/general) y su vínculo a las
-- cuentas de Ingreso (I.x), Costo de Ventas (G.4.x) y su CxC estaban HARDCODEADOS
-- en el código (src/domain/sales/resolveAccounts.ts). Esta tabla los mueve a datos:
-- cada empresa puede renombrar, agregar o desactivar canales y elegir sus cuentas.
--
-- Mecánica: la cuenta contable se resuelve en el cliente y se pasa a create_sale
-- (payload.revenue_account / cogs_account), así que la RPC no cambia. El canal se
-- guarda como texto en sales.canal (por eso se elimina el CHECK que lo limitaba a
-- los 4 valores fijos).

CREATE TABLE IF NOT EXISTS public.company_sale_channel_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  canal_key         text NOT NULL,
  label             text NOT NULL,
  revenue_account   text NOT NULL,
  cogs_account      text NOT NULL,
  cxc_tipo_pago     text,               -- método CxC que usa este canal (opcional)
  enabled           boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_sale_channel_config_unique UNIQUE (company_id, canal_key)
);

ALTER TABLE public.company_sale_channel_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_member_all" ON public.company_sale_channel_config;
CREATE POLICY "company_member_all" ON public.company_sale_channel_config
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

-- Permitir canales personalizados: sales.canal deja de estar limitado a los 4 fijos.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_canal_check;
