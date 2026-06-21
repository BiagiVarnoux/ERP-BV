-- fix: al canjear un código de invitación, sembrar member_permissions según el rol.
-- Sin esto, los invitados no-owner quedaban con 0 permisos → ningún módulo visible
-- (mismo síntoma que el bug de onboarding, pero en el flujo de holding/invitación).
CREATE OR REPLACE FUNCTION public.redeem_invitation_code(_code text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code_data     RECORD;
  _company_id    uuid;
  _data_owner_id uuid;
  _member_id     uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: cannot redeem invitation on behalf of another user';
  END IF;

  SELECT * INTO _code_data
    FROM public.invitation_codes
   WHERE code = _code AND used = false AND expires_at > now()
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código de invitación inválido o expirado');
  END IF;

  _company_id := COALESCE(_code_data.company_id, '00000000-0000-0000-0000-000000000001'::uuid);

  -- Resolver el dueño real de los datos: owner con más cuentas contables.
  SELECT cm.user_id INTO _data_owner_id
    FROM public.company_members cm
   WHERE cm.company_id = _company_id
     AND cm.role_typed = 'owner'
   ORDER BY (
     SELECT COUNT(*) FROM public.accounts a WHERE a.user_id = cm.user_id
   ) DESC
   LIMIT 1;

  IF _data_owner_id IS NULL THEN
    _data_owner_id := _code_data.owner_id;
  END IF;

  -- Crear/actualizar la membresía con el rol invitado y capturar su id
  INSERT INTO public.company_members (company_id, user_id, role, role_typed)
    VALUES (_company_id, _user_id, _code_data.role_to_assign, _code_data.role_to_assign)
    ON CONFLICT (company_id, user_id) DO UPDATE
      SET role       = EXCLUDED.role,
          role_typed = EXCLUDED.role_typed
    RETURNING id INTO _member_id;

  -- ★ CLAVE: sembrar los permisos por defecto del rol en member_permissions.
  PERFORM public.assign_default_permissions(_member_id, _code_data.role_to_assign);

  -- (Legado) mantener shared_access para compatibilidad con vistas antiguas
  INSERT INTO public.shared_access (
    owner_id, viewer_id,
    can_view_accounts, can_view_journal, can_view_auxiliary,
    can_view_ledger, can_view_reports
  ) VALUES (
    _data_owner_id, _user_id,
    _code_data.can_view_accounts, _code_data.can_view_journal,
    _code_data.can_view_auxiliary, _code_data.can_view_ledger,
    _code_data.can_view_reports
  )
  ON CONFLICT (owner_id, viewer_id) DO UPDATE
    SET can_view_accounts  = EXCLUDED.can_view_accounts,
        can_view_journal   = EXCLUDED.can_view_journal,
        can_view_auxiliary = EXCLUDED.can_view_auxiliary,
        can_view_ledger    = EXCLUDED.can_view_ledger,
        can_view_reports   = EXCLUDED.can_view_reports;

  -- (Legado) user_roles global — refleja el rol invitado, no forzar 'viewer'
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (_user_id,
            CASE WHEN _code_data.role_to_assign = 'owner' THEN 'owner'::app_role ELSE 'viewer'::app_role END,
            _company_id)
    ON CONFLICT DO NOTHING;

  UPDATE public.invitation_codes
     SET used = true, used_by = _user_id
   WHERE id = _code_data.id;

  RETURN jsonb_build_object('success', true, 'company_id', _company_id,
                            'role', _code_data.role_to_assign);
END;
$$;
