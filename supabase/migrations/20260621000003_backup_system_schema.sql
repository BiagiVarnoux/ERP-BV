-- ════════════════════════════════════════════════════════════════════════════
-- Sistema de backup automático por empresa — esquema + RLS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.backup_schedules (
  company_id      uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT true,
  interval_hours  integer NOT NULL DEFAULT 24 CHECK (interval_hours >= 1 AND interval_hours <= 8760),
  retention_count integer NOT NULL DEFAULT 30 CHECK (retention_count >= 1 AND retention_count <= 365),
  last_run_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_backups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto','manual')),
  version     text NOT NULL DEFAULT '3.1',
  payload     jsonb NOT NULL,
  size_bytes  bigint,
  counts      jsonb
);

CREATE INDEX IF NOT EXISTS idx_company_backups_company_created
  ON public.company_backups (company_id, created_at DESC);

ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_backups  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_schedule" ON public.backup_schedules;
CREATE POLICY "members_read_schedule" ON public.backup_schedules
  FOR SELECT USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "owners_manage_schedule" ON public.backup_schedules;
CREATE POLICY "owners_manage_schedule" ON public.backup_schedules
  FOR ALL USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm
                   WHERE cm.user_id = auth.uid() AND cm.role_typed = 'owner')
  ) WITH CHECK (
    company_id IN (SELECT cm.company_id FROM public.company_members cm
                   WHERE cm.user_id = auth.uid() AND cm.role_typed = 'owner')
  );

DROP POLICY IF EXISTS "members_read_backups" ON public.company_backups;
CREATE POLICY "members_read_backups" ON public.company_backups
  FOR SELECT USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "owners_delete_backups" ON public.company_backups;
CREATE POLICY "owners_delete_backups" ON public.company_backups
  FOR DELETE USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm
                   WHERE cm.user_id = auth.uid() AND cm.role_typed = 'owner')
  );
