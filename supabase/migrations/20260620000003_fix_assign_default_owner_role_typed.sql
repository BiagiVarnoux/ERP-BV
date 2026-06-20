-- fix: incluir role_typed = 'owner' en el INSERT para que loadAccess()
-- no lo interprete como viewer (role_typed tiene prioridad sobre role).
CREATE OR REPLACE FUNCTION public.assign_default_owner_role(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_company uuid   := '00000000-0000-0000-0000-000000000001';
  v_rows            bigint := 0;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id) THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (_user_id, 'owner'::app_role, v_default_company)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.company_members (company_id, user_id, role, role_typed)
    VALUES (v_default_company, _user_id, 'owner', 'owner')
    ON CONFLICT (company_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', true, 'created', v_rows > 0);
END;
$$;
