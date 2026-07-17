-- Vincula Cuentas por Cobrar con el Libro Diario (mismo nivel que ya tiene CxP),
-- y refactoriza las funciones de CxP en dos capas para poder reutilizarlas
-- desde el Libro Diario (asiento ya existente) además del módulo (asiento se
-- crea junto con el registro):
--   - attach_*  : solo registra en payables/receivables + debt_payments,
--                 recibe un journal_entry_id que YA EXISTE. La usa el Diario.
--   - *_with_journal : crea el asiento Y llama a attach_* — la usa el módulo.

-- ─── receivables: columnas nuevas ──────────────────────────────────────────

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS journal_entry_id  text,
  ADD COLUMN IF NOT EXISTS cuenta_activo_id  text,
  ADD COLUMN IF NOT EXISTS cuenta_ingreso_id text;

-- ═══════════════════════════════════════════════════════════════════════════
-- CxP — capa núcleo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.attach_payable_to_journal_line(
  p_company_id        uuid,
  p_journal_entry_id  text,
  p_cuenta_pasivo_id  text,
  p_cuenta_gasto_id   text,
  p_proveedor_nombre  text,
  p_proveedor_nit     text,
  p_numero_documento  text,
  p_fecha_emision     date,
  p_fecha_vencimiento date,
  p_monto_original    numeric,
  p_moneda            text,
  p_notas             text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_payable_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;
  IF p_cuenta_pasivo_id IS NULL OR p_cuenta_pasivo_id = '' THEN
    RAISE EXCEPTION 'Debes indicar la cuenta por pagar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_cuenta_pasivo_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', p_cuenta_pasivo_id;
  END IF;
  IF p_monto_original IS NULL OR p_monto_original <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  INSERT INTO public.payables (
    id, company_id, user_id, proveedor_nombre, proveedor_nit, numero_documento,
    fecha_emision, fecha_vencimiento, monto_original, monto_pendiente, moneda,
    estado, notas, journal_entry_id, cuenta_gasto_id, cuenta_pasivo_id
  ) VALUES (
    v_payable_id, p_company_id, v_user_id, p_proveedor_nombre, p_proveedor_nit, p_numero_documento,
    p_fecha_emision, p_fecha_vencimiento, p_monto_original, p_monto_original,
    COALESCE(p_moneda, 'BOB'), 'open', p_notas,
    p_journal_entry_id, p_cuenta_gasto_id, p_cuenta_pasivo_id
  );

  RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_payable_to_journal_line(uuid, text, text, text, text, text, text, date, date, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_payable_to_journal_line(uuid, text, text, text, text, text, text, date, date, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_payable_payment_to_journal_line(
  p_company_id       uuid,
  p_journal_entry_id text,
  p_payable_id       uuid,
  p_monto            numeric,
  p_fecha            date,
  p_tipo_pago        text,
  p_notas            text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_pay           public.payables%ROWTYPE;
  v_new_pendiente numeric(18,2);
  v_new_estado    text;
  v_payment_id    uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;

  SELECT * INTO v_pay FROM public.payables WHERE id = p_payable_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF p_monto > v_pay.monto_pendiente THEN
    RAISE EXCEPTION 'El monto no puede superar el pendiente (%)', v_pay.monto_pendiente;
  END IF;

  INSERT INTO public.debt_payments (id, company_id, user_id, receivable_id, payable_id, fecha, monto, tipo_pago, journal_entry_id, notas)
  VALUES (v_payment_id, p_company_id, v_user_id, NULL, p_payable_id, p_fecha, p_monto, p_tipo_pago, p_journal_entry_id, p_notas);

  v_new_pendiente := GREATEST(0, round((v_pay.monto_pendiente - p_monto)::numeric, 2));
  v_new_estado    := CASE WHEN v_new_pendiente <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE public.payables
     SET monto_pendiente = v_new_pendiente, estado = v_new_estado, updated_at = now()
   WHERE id = p_payable_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'monto_pendiente', v_new_pendiente, 'estado', v_new_estado);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_payable_payment_to_journal_line(uuid, text, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_payable_payment_to_journal_line(uuid, text, uuid, numeric, date, text, text) TO authenticated;

-- ─── CxP — wrappers (módulo): crean el asiento y llaman a la capa núcleo ────

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
  v_attach        jsonb;
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

  v_attach := public.attach_payable_to_journal_line(
    v_company_id, v_entry_id, v_cuenta_pasivo, v_cuenta_gasto,
    v_proveedor, NULLIF(payload->>'proveedor_nit', ''), v_numero,
    v_fecha, NULLIF(payload->>'fecha_vencimiento', '')::date, v_monto,
    COALESCE(payload->>'moneda', 'BOB'), NULLIF(payload->>'notas', '')
  );

  RETURN jsonb_build_object('success', true, 'payable_id', v_attach->>'payable_id', 'entry_id', v_entry_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payable_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_payable_with_journal(jsonb) TO authenticated;

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
  v_attach        jsonb;
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

  v_attach := public.attach_payable_payment_to_journal_line(v_company_id, v_entry_id, v_payable_id, v_monto, v_fecha, v_tipo_pago, v_notas);

  RETURN jsonb_build_object(
    'success', true, 'payment_id', v_attach->>'payment_id', 'entry_id', v_entry_id,
    'monto_pendiente', (v_attach->>'monto_pendiente')::numeric, 'estado', v_attach->>'estado'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_payable_payment_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_payable_payment_with_journal(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CxC — capa núcleo (nuevo)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.attach_receivable_to_journal_line(
  p_company_id        uuid,
  p_journal_entry_id  text,
  p_cuenta_activo_id  text,
  p_cuenta_ingreso_id text,
  p_customer_id       uuid,
  p_numero_documento  text,
  p_fecha_emision     date,
  p_fecha_vencimiento date,
  p_monto_original    numeric,
  p_moneda            text,
  p_notas             text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_receivable_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;
  IF p_cuenta_activo_id IS NULL OR p_cuenta_activo_id = '' THEN
    RAISE EXCEPTION 'Debes indicar la cuenta por cobrar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_cuenta_activo_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', p_cuenta_activo_id;
  END IF;
  IF p_monto_original IS NULL OR p_monto_original <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  INSERT INTO public.receivables (
    id, company_id, user_id, customer_id, sale_id, numero_documento,
    fecha_emision, fecha_vencimiento, monto_original, monto_pendiente, moneda,
    estado, notas, journal_entry_id, cuenta_activo_id, cuenta_ingreso_id
  ) VALUES (
    v_receivable_id, p_company_id, v_user_id, p_customer_id, NULL, p_numero_documento,
    p_fecha_emision, p_fecha_vencimiento, p_monto_original, p_monto_original,
    COALESCE(p_moneda, 'BOB'), 'open', p_notas,
    p_journal_entry_id, p_cuenta_activo_id, p_cuenta_ingreso_id
  );

  RETURN jsonb_build_object('success', true, 'receivable_id', v_receivable_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_receivable_to_journal_line(uuid, text, text, text, uuid, text, date, date, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_receivable_to_journal_line(uuid, text, text, text, uuid, text, date, date, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_receivable_payment_to_journal_line(
  p_company_id       uuid,
  p_journal_entry_id text,
  p_receivable_id    uuid,
  p_monto            numeric,
  p_fecha            date,
  p_tipo_pago        text,
  p_notas            text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_rec           public.receivables%ROWTYPE;
  v_new_pendiente numeric(18,2);
  v_new_estado    text;
  v_payment_id    uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = p_company_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;

  SELECT * INTO v_rec FROM public.receivables WHERE id = p_receivable_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF p_monto > v_rec.monto_pendiente THEN
    RAISE EXCEPTION 'El monto no puede superar el pendiente (%)', v_rec.monto_pendiente;
  END IF;

  INSERT INTO public.debt_payments (id, company_id, user_id, receivable_id, payable_id, fecha, monto, tipo_pago, journal_entry_id, notas)
  VALUES (v_payment_id, p_company_id, v_user_id, p_receivable_id, NULL, p_fecha, p_monto, p_tipo_pago, p_journal_entry_id, p_notas);

  v_new_pendiente := GREATEST(0, round((v_rec.monto_pendiente - p_monto)::numeric, 2));
  v_new_estado    := CASE WHEN v_new_pendiente <= 0 THEN 'paid' ELSE 'partial' END;

  UPDATE public.receivables
     SET monto_pendiente = v_new_pendiente, estado = v_new_estado, updated_at = now()
   WHERE id = p_receivable_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'monto_pendiente', v_new_pendiente, 'estado', v_new_estado);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_receivable_payment_to_journal_line(uuid, text, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_receivable_payment_to_journal_line(uuid, text, uuid, numeric, date, text, text) TO authenticated;

-- ─── CxC — wrappers (módulo) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_receivable_with_journal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_company_id     uuid := NULLIF(payload->>'company_id', '')::uuid;
  v_fecha          date := (payload->>'fecha_emision')::date;
  v_monto          numeric(18,2) := (payload->>'monto_original')::numeric;
  v_cuenta_activo  text := payload->>'cuenta_activo_id';
  v_cuenta_ingreso text := payload->>'cuenta_ingreso_id';
  v_customer_id    uuid := NULLIF(payload->>'customer_id', '')::uuid;
  v_numero         text := payload->>'numero_documento';
  v_entry_id       text;
  v_attach         jsonb;
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
  IF v_cuenta_activo IS NULL OR v_cuenta_activo = '' OR v_cuenta_ingreso IS NULL OR v_cuenta_ingreso = '' THEN
    RAISE EXCEPTION 'Debes seleccionar la cuenta por cobrar y la cuenta de ingreso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_activo AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_activo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_ingreso AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_ingreso;
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'CxC ' || v_numero);

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_activo, v_monto, 0, v_numero);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_ingreso, 0, v_monto, v_numero);

  v_attach := public.attach_receivable_to_journal_line(
    v_company_id, v_entry_id, v_cuenta_activo, v_cuenta_ingreso,
    v_customer_id, v_numero, v_fecha, NULLIF(payload->>'fecha_vencimiento', '')::date, v_monto,
    COALESCE(payload->>'moneda', 'BOB'), NULLIF(payload->>'notas', '')
  );

  RETURN jsonb_build_object('success', true, 'receivable_id', v_attach->>'receivable_id', 'entry_id', v_entry_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_receivable_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_receivable_with_journal(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_receivable_payment_with_journal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_company_id    uuid := NULLIF(payload->>'company_id', '')::uuid;
  v_receivable_id uuid := NULLIF(payload->>'receivable_id', '')::uuid;
  v_fecha         date := (payload->>'fecha')::date;
  v_monto         numeric(18,2) := (payload->>'monto')::numeric;
  v_cuenta_pago   text := payload->>'cuenta_pago_id';
  v_tipo_pago     text := payload->>'tipo_pago';
  v_notas         text := NULLIF(payload->>'notas', '');
  v_rec           public.receivables%ROWTYPE;
  v_entry_id      text;
  v_attach        jsonb;
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

  SELECT * INTO v_rec FROM public.receivables WHERE id = v_receivable_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
  IF v_rec.cuenta_activo_id IS NULL THEN
    RAISE EXCEPTION 'Esta cuenta por cobrar no tiene cuenta contable vinculada (fue creada antes de esta función) — no se puede generar el asiento de cobro automáticamente.';
  END IF;
  IF v_cuenta_pago IS NULL OR v_cuenta_pago = '' THEN
    RAISE EXCEPTION 'Debes seleccionar la cuenta de banco/caja donde se cobra';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_cuenta_pago AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa', v_cuenta_pago;
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF v_monto > v_rec.monto_pendiente THEN
    RAISE EXCEPTION 'El monto no puede superar el pendiente (%)', v_rec.monto_pendiente;
  END IF;

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'Cobro CxC ' || v_rec.numero_documento);

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_cuenta_pago, v_monto, 0, 'Cobro ' || v_rec.numero_documento);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, v_rec.cuenta_activo_id, 0, v_monto, 'Cobro ' || v_rec.numero_documento);

  v_attach := public.attach_receivable_payment_to_journal_line(v_company_id, v_entry_id, v_receivable_id, v_monto, v_fecha, v_tipo_pago, v_notas);

  RETURN jsonb_build_object(
    'success', true, 'payment_id', v_attach->>'payment_id', 'entry_id', v_entry_id,
    'monto_pendiente', (v_attach->>'monto_pendiente')::numeric, 'estado', v_attach->>'estado'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_receivable_payment_with_journal(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_receivable_payment_with_journal(jsonb) TO authenticated;
