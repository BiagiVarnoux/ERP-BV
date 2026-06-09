-- Fix redeem_invitation_code RPC
-- Problems fixed:
-- 1. Code was marked used=true BEFORE inserts → if insert failed, code was burned
-- 2. No ON CONFLICT on shared_access → duplicate key error on retry
-- 3. role_typed was not set in company_members → defaulted to 'custom'
-- 4. owner_id in shared_access pointed to code generator instead of data owner
--    (matters when a co-owner generates the code but isn't the one with data)

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
BEGIN
  -- Solo el propio usuario puede canjear su código
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: cannot redeem invitation on behalf of another user';
  END IF;

  -- Buscar código válido (no usado, no expirado)
  SELECT * INTO _code_data
    FROM public.invitation_codes
   WHERE code = _code AND used = false AND expires_at > now()
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código de invitación inválido o expirado');
  END IF;

  _company_id := COALESCE(_code_data.company_id, '00000000-0000-0000-0000-000000000001'::uuid);

  -- El dueño de los datos es el owner más antiguo de la empresa
  -- (no necesariamente quien generó el código, que puede ser un co-owner sin datos)
  SELECT cm.user_id INTO _data_owner_id
    FROM public.company_members cm
   WHERE cm.company_id = _company_id
     AND cm.role_typed = 'owner'
   ORDER BY cm.created_at ASC
   LIMIT 1;

  -- Si no hay owner con role_typed='owner', usar el generador del código como fallback
  IF _data_owner_id IS NULL THEN
    _data_owner_id := _code_data.owner_id;
  END IF;

  -- Insertar en company_members con el rol correcto (ON CONFLICT para idempotencia)
  INSERT INTO public.company_members (company_id, user_id, role, role_typed)
    VALUES (_company_id, _user_id, _code_data.role_to_assign, _code_data.role_to_assign)
    ON CONFLICT (company_id, user_id) DO UPDATE
      SET role       = EXCLUDED.role,
          role_typed = EXCLUDED.role_typed;

  -- Insertar shared_access apuntando al dueño real de los datos
  -- ON CONFLICT DO UPDATE para que reintentos actualicen en vez de fallar
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

  -- También actualizar user_roles (tabla legada, para compatibilidad)
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (_user_id, 'viewer'::app_role, _company_id)
    ON CONFLICT DO NOTHING;

  -- Marcar código como usado SOLO al final (después de que todo exitó)
  UPDATE public.invitation_codes
     SET used = true, used_by = _user_id
   WHERE id = _code_data.id;

  RETURN jsonb_build_object('success', true, 'company_id', _company_id);
END;
$$;
