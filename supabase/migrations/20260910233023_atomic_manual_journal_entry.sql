-- Corrige una condición de carrera real: el Libro Diario manual calculaba el
-- siguiente ID de asiento en el cliente (generateEntryId sobre la lista de
-- asientos ya cargada en esa pestaña) y guardaba con upsert. Si dos pestañas
-- guardaban casi al mismo tiempo, ambas calculaban el mismo ID y la segunda
-- sobrescribía en silencio la cabecera y las líneas de la primera (pérdida de
-- datos sin ningún error visible). Esto ya ocurrió en producción (asiento
-- 216-Q3-26, 2026-09-10).
--
-- Arreglo en dos partes:
--   1) next_journal_entry_id toma un advisory lock transaccional por
--      (empresa, trimestre) antes de calcular el máximo — así dos llamadas
--      concurrentes nunca pueden calcular el mismo "siguiente número". Esto
--      beneficia también a create_sale/create_payable_with_journal/etc. que
--      ya usan esta función.
--   2) create_manual_journal_entry: nueva RPC atómica que calcula el ID
--      (bajo el lock de arriba) e inserta la cabecera + líneas dentro de la
--      MISMA transacción, con INSERT (no upsert) — si algo raro colisionara,
--      falla con un error claro en vez de pisar datos existentes. El Libro
--      Diario ahora usa esta RPC para asientos NUEVOS (altas y anulaciones);
--      la edición de un asiento ya existente sigue usando update, que no
--      tiene este riesgo porque el id ya existe y es fijo.

CREATE OR REPLACE FUNCTION public.next_journal_entry_id(
  p_user_id    uuid,
  p_date       date,
  p_company_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    text;
  v_quarter int;
  v_qid     text;
  v_max     int := 0;
  v_seq     int;
BEGIN
  v_year    := to_char(p_date, 'YY');
  v_quarter := extract(quarter FROM p_date);
  v_qid     := 'Q' || v_quarter || '-' || v_year;

  -- Serializa a nivel de transacción por (empresa, trimestre) — o por usuario
  -- si no hay empresa (modo legado). Se libera solo al terminar la transacción
  -- que invocó esta función, así que el cómputo del máximo y el INSERT que
  -- hace el caller quedan protegidos como una sola sección crítica.
  IF p_company_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('journal_entry_id|' || p_company_id::text || '|' || v_qid)::bigint);
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('journal_entry_id|' || p_user_id::text || '|' || v_qid)::bigint);
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT COALESCE(MAX((substring(id FROM '^(\d{3})-')::int)), 0)
      INTO v_max
      FROM public.journal_entries
     WHERE company_id = p_company_id
       AND id LIKE '%-' || v_qid;
  ELSE
    SELECT COALESCE(MAX((substring(id FROM '^(\d{3})-')::int)), 0)
      INTO v_max
      FROM public.journal_entries
     WHERE user_id = p_user_id
       AND id LIKE '%-' || v_qid;
  END IF;

  v_seq := v_max + 1;
  RETURN lpad(v_seq::text, 3, '0') || '-' || v_qid;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_journal_entry(
  p_company_id  uuid,
  p_date        date,
  p_entry_time  text,
  p_memo        text,
  p_void_of     text,
  p_lines       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_entry_id   text;
  v_line       jsonb;
  v_account_id text;
  v_debit      numeric(18,2);
  v_credit     numeric(18,2);
  v_count      int := 0;
  v_sum_debit  numeric(18,2) := 0;
  v_sum_credit numeric(18,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.user_id = v_user_id
      AND (
        cm.role_typed = 'owner'
        OR EXISTS (
          SELECT 1 FROM public.member_permissions mp
          WHERE mp.company_member_id = cm.id AND mp.module = 'journal' AND mp.can_create = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar asientos';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'El asiento necesita al menos 2 líneas';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_account_id := v_line->>'account_id';
    v_debit      := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit     := COALESCE((v_line->>'credit')::numeric, 0);

    IF v_account_id IS NULL OR v_account_id = '' THEN
      RAISE EXCEPTION 'Línea sin cuenta';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_account_id AND company_id = p_company_id AND is_active = true) THEN
      RAISE EXCEPTION 'Cuenta "%" no existe o está inactiva', v_account_id;
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'Una línea no puede tener Debe y Haber a la vez';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'Línea sin importe';
    END IF;

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'El asiento necesita al menos 2 líneas';
  END IF;
  IF round(v_sum_debit, 2) <> round(v_sum_credit, 2) THEN
    RAISE EXCEPTION 'El asiento no cuadra (Debe % ≠ Haber %)', v_sum_debit, v_sum_credit;
  END IF;

  IF p_void_of IS NOT NULL AND p_void_of <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = p_void_of AND company_id = p_company_id) THEN
      RAISE EXCEPTION 'El asiento a anular "%" no existe en esta empresa', p_void_of;
    END IF;
  END IF;

  -- Bajo el advisory lock de next_journal_entry_id: calcular el ID e insertar
  -- quedan como una sola sección crítica para esta empresa+trimestre.
  v_entry_id := public.next_journal_entry_id(v_user_id, p_date, p_company_id);

  INSERT INTO public.journal_entries (id, user_id, company_id, date, entry_time, memo, void_of)
  VALUES (v_entry_id, v_user_id, p_company_id, p_date, NULLIF(p_entry_time, ''), NULLIF(p_memo, ''), NULLIF(p_void_of, ''));

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  SELECT v_entry_id,
         l->>'account_id',
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         NULLIF(l->>'line_memo', '')
  FROM jsonb_array_elements(p_lines) AS l;

  RETURN jsonb_build_object('success', true, 'id', v_entry_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_journal_entry(uuid, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_manual_journal_entry(uuid, date, text, text, text, jsonb) TO authenticated;
