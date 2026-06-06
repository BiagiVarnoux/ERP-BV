-- Enable RLS on companies table.
-- Access is gated through company_members: a user can only see/modify
-- companies they belong to. This avoids the cross-tenant data leak that
-- Supabase flagged as a critical security issue.

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can only see companies they are members of.
CREATE POLICY "members_can_view_company"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can create a new company (they will be
-- added as owner via the application layer immediately after).
CREATE POLICY "authenticated_can_create_company"
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE / DELETE: only owners (role = 'owner' in company_members) may
-- modify or delete the company record.
CREATE POLICY "owners_can_update_company"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "owners_can_delete_company"
  ON public.companies
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
