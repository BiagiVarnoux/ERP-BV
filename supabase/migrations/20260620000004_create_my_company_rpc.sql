-- RPC: create_my_company
-- Crea una empresa nueva y asigna al usuario que llama como owner.
-- Usado en el onboarding de usuarios que se registran sin código de invitación.
CREATE OR REPLACE FUNCTION public.create_my_company(
  p_name     text,
  p_slug     text,
  p_country  text DEFAULT 'BO',
  p_currency text DEFAULT 'BOB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Evitar que un usuario que ya tiene empresa cree otra por accidente
  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'El usuario ya pertenece a una empresa';
  END IF;

  -- Crear empresa
  INSERT INTO public.companies (name, slug, country, currency, is_holding)
  VALUES (p_name, p_slug, p_country, p_currency, false)
  RETURNING id INTO v_company_id;

  -- Crear membresía como owner con role_typed correcto
  INSERT INTO public.company_members (company_id, user_id, role, role_typed)
  VALUES (v_company_id, v_user_id, 'owner', 'owner');

  RETURN jsonb_build_object('success', true, 'company_id', v_company_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_my_company(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_my_company(text, text, text, text) TO authenticated;
