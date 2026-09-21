-- ════════════════════════════════════════════════════════════════════════════
-- Módulo: Impuestos (TX)
--
-- Primera entrega: Libro de Compras IVA (crédito fiscal) y Libro de Ventas IVA
-- (débito fiscal), ambos sobre una única tabla `tax_documents`.
--
-- Por qué una tabla propia y no una vista derivada de `sales` / `payables`:
--   · hay facturas de compra que nunca pasan por CxP (compras al contado),
--   · el libro fiscal necesita datos que el asiento contable no guarda
--     (nº de autorización/CUF, código de control, NIT, base imponible),
--   · una factura puede anularse fiscalmente sin anular la venta contable.
-- El enlace con el resto del ERP (`sale_id`, `payable_id`, `journal_entry_id`)
-- es OPCIONAL: sirve para importar y para evitar cargas duplicadas.
--
-- Régimen boliviano (Ley 843): el IVA es "por dentro". El débito/crédito fiscal
-- es el 13% del importe facturado neto de exentos, ICE/IEHD y descuentos.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tax_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id              uuid,                     -- quién lo registró (referencia, NO scope)

  -- 'compra' → crédito fiscal | 'venta' → débito fiscal
  tipo                 text NOT NULL CHECK (tipo IN ('compra','venta')),

  fecha                date NOT NULL,            -- fecha de emisión de la factura
  -- Período fiscal de declaración (YYYY-MM). Derivado de `fecha`, pero editable:
  -- una factura de compra puede declararse en un período posterior.
  periodo              text NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

  -- ─── Contraparte ─────────────────────────────────────────────────────────
  nit                  text,
  razon_social         text NOT NULL DEFAULT '',

  -- ─── Identificación fiscal del documento ─────────────────────────────────
  tipo_documento       text NOT NULL DEFAULT 'factura'
                       CHECK (tipo_documento IN ('factura','nota_credito','nota_debito','dui','recibo_alquiler','otro')),
  numero_factura       text,
  numero_autorizacion  text,                     -- nº de autorización o CUF (facturación electrónica)
  codigo_control       text,

  -- ─── Importes (Bs) ───────────────────────────────────────────────────────
  importe_total        numeric NOT NULL DEFAULT 0,   -- total de la factura, IVA incluido
  importe_ice          numeric NOT NULL DEFAULT 0,   -- ICE / IEHD / tasas: no dan crédito fiscal
  importe_exento       numeric NOT NULL DEFAULT 0,
  descuentos           numeric NOT NULL DEFAULT 0,
  base_imponible       numeric NOT NULL DEFAULT 0,   -- total − ice − exento − descuentos
  alicuota             numeric NOT NULL DEFAULT 13,  -- %
  iva                  numeric NOT NULL DEFAULT 0,   -- crédito (compra) o débito (venta) fiscal

  -- ─── Estado fiscal ───────────────────────────────────────────────────────
  estado               text NOT NULL DEFAULT 'vigente'
                       CHECK (estado IN ('vigente','anulada')),
  -- Solo compras: factura registrada que NO da derecho a crédito fiscal
  -- (no vinculada a la actividad gravada, sin respaldo de pago bancarizado, etc.).
  con_derecho_credito  boolean NOT NULL DEFAULT true,

  -- ─── Enlaces opcionales con el resto del ERP ─────────────────────────────
  sale_id              uuid REFERENCES public.sales(id)    ON DELETE SET NULL,
  payable_id           uuid REFERENCES public.payables(id) ON DELETE SET NULL,
  -- journal_entries tiene PK compuesta lógica (id texto por empresa): sin FK.
  journal_entry_id     text,

  notas                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Listado del libro: siempre filtrado por empresa + tipo + período.
CREATE INDEX IF NOT EXISTS idx_tax_documents_company_periodo
  ON public.tax_documents (company_id, tipo, periodo, fecha);

-- Búsqueda por proveedor/cliente y detección de duplicados en la UI.
CREATE INDEX IF NOT EXISTS idx_tax_documents_company_nit
  ON public.tax_documents (company_id, nit);

-- Una venta / una CxP generan a lo sumo UNA fila del libro: evita doble importación.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_documents_sale
  ON public.tax_documents (sale_id) WHERE sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_documents_payable
  ON public.tax_documents (payable_id) WHERE payable_id IS NOT NULL;

-- ─── Descarte de CxP sin factura ────────────────────────────────────────────
-- No toda Cuenta por Pagar es una factura con crédito fiscal (préstamos, sueldos,
-- servicios sin factura). Esta bandera las saca de la lista de candidatas a
-- importar para que el importador no se ensucie mes a mes.
ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS sin_credito_fiscal boolean NOT NULL DEFAULT false;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_member_all" ON public.tax_documents;
CREATE POLICY "company_member_all" ON public.tax_documents
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
