-- ================================================================
-- FASE 1: Migrar RLS de user_id a company_id
-- ================================================================
--
-- PROBLEMA ACTUAL:
--   Las políticas tienen: auth.uid() = user_id AND company_id IN (...)
--   → Los miembros invitados (viewers, accountants) no pueden ver
--     datos del owner porque su user_id es diferente.
--
-- SOLUCIÓN:
--   Reemplazar todas las políticas por: company_id IN (
--     SELECT company_id FROM company_members WHERE user_id = auth.uid()
--   )
--   → Cualquier miembro de la empresa accede a todos los datos
--     de la empresa, independientemente de quién los creó (user_id).
--
-- ALCANCE: todas las tablas con company_id (17 tablas de datos).
-- Las tablas child (journal_lines, sale_items, auxiliary_movement_details)
-- heredan seguridad a través de su tabla padre.
--
-- NOTA SEGURIDAD:
--   - IDOR de escritura sigue protegido en capa de aplicación
--     (SupaAdapter incluye .eq('user_id', userId) en UPDATE/DELETE)
--   - Viewers con member_permissions solo pueden leer módulos permitidos
--     (controlado en UserAccessContext, no en RLS de datos)
-- ================================================================

-- Helper para evitar repetir el subquery
-- (function inline, no persiste en schema)

-- ================================================================
-- accounts
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='accounts'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.accounts'; END LOOP;
END $$;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.accounts
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.accounts
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.accounts
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- journal_entries
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='journal_entries'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.journal_entries'; END LOOP;
END $$;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.journal_entries
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- auxiliary_ledger
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='auxiliary_ledger'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.auxiliary_ledger'; END LOOP;
END $$;

ALTER TABLE public.auxiliary_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.auxiliary_ledger
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.auxiliary_ledger
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.auxiliary_ledger
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.auxiliary_ledger
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- auxiliary_ledger_definitions
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='auxiliary_ledger_definitions'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.auxiliary_ledger_definitions'; END LOOP;
END $$;

ALTER TABLE public.auxiliary_ledger_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.auxiliary_ledger_definitions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.auxiliary_ledger_definitions
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.auxiliary_ledger_definitions
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.auxiliary_ledger_definitions
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- quarterly_closures
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='quarterly_closures'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.quarterly_closures'; END LOOP;
END $$;

ALTER TABLE public.quarterly_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.quarterly_closures
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.quarterly_closures
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.quarterly_closures
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.quarterly_closures
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- audit_log
-- (sin UPDATE/DELETE por diseño — solo INSERT y SELECT)
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='audit_log'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.audit_log'; END LOOP;
END $$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- Políticas RESTRICTIVE para bloquear DELETE/UPDATE en audit_log (integridad de auditoría)
CREATE POLICY "audit_no_delete" ON public.audit_log
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "audit_no_update" ON public.audit_log
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false);


-- ================================================================
-- report_settings
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='report_settings'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.report_settings'; END LOOP;
END $$;

ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.report_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.report_settings
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.report_settings
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.report_settings
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- shipments
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='shipments'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.shipments'; END LOOP;
END $$;

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.shipments
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.shipments
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.shipments
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.shipments
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- sales
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sales'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.sales'; END LOOP;
END $$;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.sales
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.sales
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.sales
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- products
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='products'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.products'; END LOOP;
END $$;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.products
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.products
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.products
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- inventory_movements
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inventory_movements'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.inventory_movements'; END LOOP;
END $$;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.inventory_movements
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.inventory_movements
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- inventory_lots
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inventory_lots'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.inventory_lots'; END LOOP;
END $$;

ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.inventory_lots
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.inventory_lots
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.inventory_lots
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.inventory_lots
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- import_lots
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='import_lots'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.import_lots'; END LOOP;
END $$;

ALTER TABLE public.import_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.import_lots
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.import_lots
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.import_lots
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.import_lots
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- cost_sheets
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='cost_sheets'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.cost_sheets'; END LOOP;
END $$;

ALTER TABLE public.cost_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.cost_sheets
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.cost_sheets
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.cost_sheets
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.cost_sheets
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- cost_sheet_cells
-- (tiene company_id desde migration 20260528000001)
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='cost_sheet_cells'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.cost_sheet_cells'; END LOOP;
END $$;

ALTER TABLE public.cost_sheet_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.cost_sheet_cells
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.cost_sheet_cells
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.cost_sheet_cells
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.cost_sheet_cells
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- kardex_definitions
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kardex_definitions'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.kardex_definitions'; END LOOP;
END $$;

ALTER TABLE public.kardex_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.kardex_definitions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.kardex_definitions
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.kardex_definitions
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.kardex_definitions
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- kardex_entries
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kardex_entries'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.kardex_entries'; END LOOP;
END $$;

ALTER TABLE public.kardex_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.kardex_entries
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.kardex_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.kardex_entries
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.kardex_entries
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- kardex_movements
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kardex_movements'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.kardex_movements'; END LOOP;
END $$;

ALTER TABLE public.kardex_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.kardex_movements
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.kardex_movements
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.kardex_movements
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.kardex_movements
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- customers
-- (creada en migration 20260601000001)
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='customers'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.customers'; END LOOP;
END $$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.customers
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.customers
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.customers
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- user_roles (tabla legada — migrar a company_id scope)
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_roles'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.user_roles'; END LOOP;
END $$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  );

CREATE POLICY "company_member_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));


-- ================================================================
-- Tablas child: journal_lines, sale_items, auxiliary_movement_details
--
-- Estas tablas no tienen company_id propio (heredan por FK).
-- Estrategia: permitir acceso si el padre es accesible.
-- ================================================================

-- journal_lines: accesible si el journal_entry padre es accesible
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='journal_lines'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.journal_lines'; END LOOP;
END $$;

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.journal_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = journal_lines.entry_id
         AND je.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_insert" ON public.journal_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = journal_lines.entry_id
         AND je.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_update" ON public.journal_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = journal_lines.entry_id
         AND je.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = journal_lines.entry_id
         AND je.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_delete" ON public.journal_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = journal_lines.entry_id
         AND je.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );


-- sale_items: accesible si la sale padre es accesible
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sale_items'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.sale_items'; END LOOP;
END $$;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id = sale_items.sale_id
         AND s.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_insert" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id = sale_items.sale_id
         AND s.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_update" ON public.sale_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id = sale_items.sale_id
         AND s.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id = sale_items.sale_id
         AND s.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );

CREATE POLICY "company_member_delete" ON public.sale_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id = sale_items.sale_id
         AND s.company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
    )
  );


-- auxiliary_movement_details (tiene company_id propio — no necesita JOIN)
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='auxiliary_movement_details'
  LOOP EXECUTE 'DROP POLICY IF EXISTS '||quote_ident(r.policyname)||' ON public.auxiliary_movement_details'; END LOOP;
END $$;

ALTER TABLE public.auxiliary_movement_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_member_select" ON public.auxiliary_movement_details
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_insert" ON public.auxiliary_movement_details
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_update" ON public.auxiliary_movement_details
  FOR UPDATE TO authenticated
  USING  (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "company_member_delete" ON public.auxiliary_movement_details
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
