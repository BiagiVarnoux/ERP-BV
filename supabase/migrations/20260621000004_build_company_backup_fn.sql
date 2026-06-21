-- Construye el JSON de backup de una empresa, con la MISMA forma que BackupData
-- (src/services/backupService.ts) para que el restore del cliente funcione igual.
-- ⚠️ Si agregas una tabla nueva con company_id, añádela también aquí.
CREATE OR REPLACE FUNCTION public.build_company_backup(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'version', '3.1',
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
    'product_categories',           COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM product_categories t WHERE t.company_id = p_company_id), '[]'::jsonb)
  );
$$;
