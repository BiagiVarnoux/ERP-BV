-- fix: assign_default_owner_role ya NO asigna usuarios a la empresa hardcodeada
-- (00000000-0000-0000-0000-000000000001 = Biagi & Varnoux).
-- El onboarding de usuarios nuevos ahora se maneja con create_my_company (empresa
-- propia) o redeem_invitation_code (empresa existente/holding). Esta función queda
-- como no-op seguro para no romper llamadas antiguas y evitar contaminar empresas.
CREATE OR REPLACE FUNCTION public.assign_default_owner_role(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN jsonb_build_object('success', true, 'created', false,
                            'note', 'onboarding handled by create_my_company / redeem_invitation_code');
END;
$$;
