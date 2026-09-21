-- Amplía `modulo_vinculado` para que una cuenta pueda vincularse al Libro de
-- Compras ('credito_fiscal') o al Libro de Ventas ('debito_fiscal') del módulo
-- de Impuestos, igual que hoy se vincula a CxP/CxC. Sin esto, una compra al
-- contado cargada por el Libro Diario nunca llega al libro fiscal y su crédito
-- fiscal se pierde en la declaración.
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_modulo_vinculado_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_modulo_vinculado_check
  CHECK (modulo_vinculado = ANY (ARRAY['cxp'::text, 'cxc'::text, 'credito_fiscal'::text, 'debito_fiscal'::text]));

-- Un asiento genera a lo sumo UNA fila de libro fiscal: evita que reeditarlo
-- (o un doble clic en el modal) cargue la factura dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_documents_journal_entry
  ON public.tax_documents (company_id, journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
