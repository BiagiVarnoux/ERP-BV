-- fix: solo asignar empresa default si el usuario no tiene ninguna membresía.
-- Sin esto, cada SIGNED_IN re-insertaba al usuario en la empresa hardcoded
-- aunque ya hubiera sido movido a otra empresa por un admin.
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

  -- Solo actuar si el usuario no tiene ninguna membresía todavía
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id) THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (_user_id, 'owner'::app_role, v_default_company)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (v_default_company, _user_id, 'owner')
    ON CONFLICT (company_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', true, 'created', v_rows > 0);
END;
$$;
