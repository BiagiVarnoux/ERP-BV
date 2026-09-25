-- Cotizaciones/proformas de cliente generadas desde un embarque cerrado.
-- El usuario elige uno o más productos del embarque, activa/desactiva
-- conceptos de costo por producto (precio, flete, GA, IVA, manipuleo, o
-- cualquier concepto personalizado como "Ganancia"), edita sus valores, y
-- genera un PDF. Cada cotización generada queda guardada aquí como
-- historial del embarque (se puede borrar con doble confirmación desde la UI).
--
-- `productos` guarda el árbol completo (producto + conceptos ya resueltos)
-- como jsonb — mismo patrón que `shipments.data` — porque la forma de cada
-- fila varía (conceptos personalizados con nombre libre) y no vale la pena
-- una tabla normalizada para algo que solo se lee para regenerar el PDF.

CREATE TABLE public.shipment_cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  numero text NOT NULL,
  cliente_nombre text,
  fecha date NOT NULL,
  productos jsonb NOT NULL,
  total_general numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_cotizaciones_shipment ON public.shipment_cotizaciones(shipment_id);
CREATE INDEX idx_shipment_cotizaciones_company ON public.shipment_cotizaciones(company_id);

ALTER TABLE public.shipment_cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_all" ON public.shipment_cotizaciones
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

-- ─── Backup server-side: agrega shipment_cotizaciones ────────────────────────
-- Tercer lugar que debe mantenerse en sync con backupService.ts (regla 2 de
-- CLAUDE.md). Child de shipments — se borra en cascada al restaurar
-- (ON DELETE CASCADE), no hace falta tocar el orden de borrado del server.
CREATE OR REPLACE FUNCTION public.build_company_backup(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'version', '3.7',
    'created_at', now(),
    'accounts',                     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM accounts t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'journal_entries',              COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM journal_entries t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'journal_lines',                COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM journal_lines t WHERE t.entry_id IN (SELECT id FROM journal_entries WHERE company_id = p_company_id)), '[]'::jsonb),
    'auxiliary_ledger_definitions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM auxiliary_ledger_definitions t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'auxiliary_ledger',             COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM auxiliary_ledger t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'auxiliary_movement_details',   COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM auxiliary_movement_details t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'kardex_definitions',           COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM kardex_definitions t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'kardex_entries',               COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM kardex_entries t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'kardex_movements',             COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM kardex_movements t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'quarterly_closures',           COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM quarterly_closures t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'products',                     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM products t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'inventory_movements',          COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM inventory_movements t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'inventory_lots',               COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM inventory_lots t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'import_lots',                  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM import_lots t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'cost_sheets',                  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM cost_sheets t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'cost_sheet_cells',             COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM cost_sheet_cells t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'report_settings',              COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM report_settings t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'shipments',                    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM shipments t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'shipment_cotizaciones',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM shipment_cotizaciones t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'sales',                        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM sales t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'sale_items',                   COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM sale_items t WHERE t.sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id)), '[]'::jsonb),
    'fiscal_years',                 COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM fiscal_years t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'customers',                    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM customers t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'receivables',                  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM receivables t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'payables',                     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM payables t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'debt_payments',                COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM debt_payments t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'member_permissions',           COALESCE((SELECT jsonb_agg(to_jsonb(mp) || jsonb_build_object('_member_user_id', cm.user_id))
                                              FROM member_permissions mp
                                              JOIN company_members cm ON cm.id = mp.company_member_id
                                              WHERE cm.company_id = p_company_id), '[]'::jsonb),
    'company_module_config',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM company_module_config t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'licitaciones',                 COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM licitaciones t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'licitacion_productos',         COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM licitacion_productos t WHERE t.licitacion_id IN (SELECT id FROM licitaciones WHERE company_id = p_company_id)), '[]'::jsonb),
    'licitacion_documentos',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM licitacion_documentos t WHERE t.licitacion_id IN (SELECT id FROM licitaciones WHERE company_id = p_company_id)), '[]'::jsonb),
    'product_categories',           COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM product_categories t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'investment_analyses',          COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM investment_analyses t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'investment_analysis_items',    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM investment_analysis_items t WHERE t.analysis_id IN (SELECT id FROM investment_analyses WHERE company_id = p_company_id)), '[]'::jsonb),
    'company_sale_account_config',  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM company_sale_account_config t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'company_sale_channel_config',  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM company_sale_channel_config t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'product_fotos',                COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM product_fotos t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'product_publicaciones',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM product_publicaciones t WHERE t.company_id = p_company_id), '[]'::jsonb),
    'tax_documents',                COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM tax_documents t WHERE t.company_id = p_company_id), '[]'::jsonb)
  );
$function$;
