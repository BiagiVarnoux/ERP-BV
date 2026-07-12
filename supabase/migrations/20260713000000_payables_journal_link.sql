-- Vincula Cuentas por Pagar con el Libro Diario.
-- Antes: crear una CxP y registrar su pago no tocaban el libro diario en
-- absoluto — el usuario debía registrar el asiento a mano en Libro Diario Y
-- por separado crear/pagar la CxP en este módulo (doble trabajo, sin vínculo).
-- Ahora: crear y pagar una CxP generan su asiento automáticamente, en un solo paso.

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS journal_entry_id text,
  ADD COLUMN IF NOT EXISTS cuenta_gasto_id  text,
  ADD COLUMN IF NOT EXISTS cuenta_pasivo_id text;

-- ─── Crear CxP + asiento (Debe: cuenta_gasto_id / Haber: cuenta_pasivo_id) ─────

CREATE OR REPLACE FUNCTION public.create_payable_with_journal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_company_id    uuid := NULLIF(payload->>'company_id', '')::uuid;
  v_fecha         date := (payload->>'fecha_emision')::date;
  v_monto         numeric(18,2) := (payload->>'monto_original')::numeric;
  v_cuenta_gasto  text := payload->>'cuenta_gasto_id';
  v_cuenta_pasivo text := payload->>'cuenta_pasivo_id';
  v_proveedor     text := payload->>'proveedor_nombre';
  v_numero        text := payload->>'numero_documento';
  v_entry_id      text;
  v_payable_id    uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requerido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;
  IF v_cuenta_gasto IS NULL OR v_cuenta_gasto = '' OR v_cuenta_pasivo IS NULL OR v_cuenta_pasivo = '' THEN
    RAISE EXCEPTION 'Debes seleccionar la cuenta de gasto/activo y la cuenta por pagar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_gasto AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_gasto;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_pasivo AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_pasivo;
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'CxP ' || v_numero || ' - ' || v_proveedor);

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_gasto, v_monto, 0, v_numero || ' - ' || v_proveedor);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_pasivo, 0, v_monto, v_numero || ' - ' || v_proveedor);

  INSERT INTO public.payables (
    id, company_id, user_id, proveedor_nombre, proveedor_nit, numero_documento,
    fecha_emision, fecha_vencimiento, monto_original, monto_pendiente, moneda,
    estado, notas, journal_entry_id, cuenta_gasto_id, cuenta_pasivo_id
  ) VALUES (
    v_payable_id, v_company_id, v_user_id, v_proveedor,
    NULLIF(payload->>'proveedor_nit', ''), v_numero,
    v_fecha, NULLIF(payload->>'fecha_vencimiento', '')::date, v_monto, v_monto,
    COALESCE(payload->>'moneda', 'BOB'), 'open', NULLIF(payload->>'notas', ''),
    v_entry_id, v_cuenta_gasto, v_cuenta_pasivo
  );

  RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id, 'entry_id', v_entry_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payable_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_payable_with_journal(jsonb) TO authenticated;

-- ─── Registrar pago + asiento (Debe: cuenta_pasivo_id / Haber: cuenta_pago_id) ─

CREATE OR REPLACE FUNCTION public.register_payable_payment_with_journal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_company_id    uuid := NULLIF(payload->>'company_id', '')::uuid;
  v_payable_id    uuid := NULLIF(payload->>'payable_id', '')::uuid;
  v_fecha         date := (payload->>'fecha')::date;
  v_monto         numeric(18,2) := (payload->>'monto')::numeric;
  v_cuenta_pago   text := payload->>'cuenta_pago_id';
  v_tipo_pago     text := payload->>'tipo_pago';
  v_notas         text := NULLIF(payload->>'notas', '');
  v_pay           public.payables%ROWTYPE;
  v_entry_id      text;
  v_new_pendiente numeric(18,2);
  v_new_estado    text;
  v_payment_id    uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requerido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;

  SELECT * INTO v_pay FROM public.payables WHERE id = v_payable_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
  IF v_pay.cuenta_pasivo_id IS NULL THEN
    RAISE EXCEPTION 'Esta cuenta por pagar no tiene cuenta contable vinculada (fue creada antes de esta función) — no se puede generar el asiento de pago automáticamente.';
  END IF;
  IF v_cuenta_pago IS NULL OR v_cuenta_pago = '' THEN
    RAISE EXCEPTION 'Debes seleccionar la cuenta de banco/caja con la que pagas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_pago AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_pago;
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF v_monto > v_pay.monto_pendiente THEN
    RAISE EXCEPTION 'El monto no puede superar el pendiente (%)', v_pay.monto_pendiente;
  END IF;

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'Pago CxP ' || v_pay.numero_documento || ' - ' || v_pay.proveedor_nombre);

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_pay.cuenta_pasivo_id, v_monto, 0, 'Pago ' || v_pay.numero_documento);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_pago, 0, v_monto, 'Pago ' || v_pay.numero_documento);

  INSERT INTO public.debt_payments (id, company_id, user_id, receivable_id, payable_id, fecha, monto, tipo_pago, journal_entry_id, notas)
  VALUES (v_payment_id, v_company_id, v_user_id, NULL, v_payable_id, v_fecha, v_monto, v_tipo_pago, v_entry_id, v_notas);

  v_new_pendiente := GREATEST(0, round((v_pay.monto_pendiente - v_monto)::numeric, 2));
  v_new_estado    := CASE WHEN v_new_pendiente <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE public.payables
     SET monto_pendiente = v_new_pendiente, estado = v_new_estado, updated_at = now()
   WHERE id = v_payable_id;

  RETURN jsonb_build_object(
    'success', true, 'payment_id', v_payment_id, 'entry_id', v_entry_id,
    'monto_pendiente', v_new_pendiente, 'estado', v_new_estado
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_payable_payment_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_payable_payment_with_journal(jsonb) TO authenticated;
