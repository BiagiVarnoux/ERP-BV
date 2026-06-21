-- Crea un snapshot de backup de una empresa y poda según retención.
-- - Llamada manual (UI, auth.uid() no nulo): requiere ser owner de la empresa.
-- - Llamada desde el cron (auth.uid() nulo): permitida.
CREATE OR REPLACE FUNCTION public.create_company_backup(p_company_id uuid, p_kind text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload   jsonb;
  v_backup_id uuid;
  v_retention integer;
  v_counts    jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.company_members
      WHERE company_id = p_company_id AND user_id = auth.uid() AND role_typed = 'owner'
    ) THEN
      RAISE EXCEPTION 'No autorizado: solo el propietario puede crear backups';
    END IF;
  END IF;

  v_payload := public.build_company_backup(p_company_id);

  v_counts := jsonb_build_object(
    'accounts',        jsonb_array_length(v_payload->'accounts'),
    'journal_entries', jsonb_array_length(v_payload->'journal_entries'),
    'sales',           jsonb_array_length(v_payload->'sales'),
    'products',        jsonb_array_length(v_payload->'products'),
    'licitaciones',    jsonb_array_length(v_payload->'licitaciones')
  );

  INSERT INTO public.company_backups (company_id, kind, version, payload, size_bytes, counts)
  VALUES (p_company_id, COALESCE(p_kind,'manual'), '3.1', v_payload, length(v_payload::text), v_counts)
  RETURNING id INTO v_backup_id;

  SELECT COALESCE(retention_count, 30) INTO v_retention
  FROM public.backup_schedules WHERE company_id = p_company_id;
  v_retention := COALESCE(v_retention, 30);

  DELETE FROM public.company_backups cb
  WHERE cb.company_id = p_company_id
    AND cb.id NOT IN (
      SELECT id FROM public.company_backups
      WHERE company_id = p_company_id
      ORDER BY created_at DESC
      LIMIT v_retention
    );

  RETURN jsonb_build_object('success', true, 'backup_id', v_backup_id,
                            'size_bytes', length(v_payload::text), 'counts', v_counts);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_company_backup(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_company_backup(uuid, text) TO authenticated;

-- Recorrido del cron: respalda las empresas cuyo intervalo ya venció.
-- Auto-siembra una configuración por defecto (diaria, retención 30) para empresas nuevas.
CREATE OR REPLACE FUNCTION public.run_scheduled_backups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec  RECORD;
  v_done integer := 0;
BEGIN
  INSERT INTO public.backup_schedules (company_id)
  SELECT c.id FROM public.companies c
  WHERE c.is_holding = false
    AND NOT EXISTS (SELECT 1 FROM public.backup_schedules s WHERE s.company_id = c.id);

  FOR v_rec IN
    SELECT company_id FROM public.backup_schedules
    WHERE enabled = true
      AND (last_run_at IS NULL OR now() - last_run_at >= (interval_hours || ' hours')::interval)
  LOOP
    BEGIN
      PERFORM public.create_company_backup(v_rec.company_id, 'auto');
      UPDATE public.backup_schedules SET last_run_at = now() WHERE company_id = v_rec.company_id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backup falló para empresa %: %', v_rec.company_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'companies_backed_up', v_done, 'ran_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_scheduled_backups() FROM PUBLIC, anon, authenticated;
