-- Añade entry_time (HH:mm, América/La_Paz) a los asientos que se generan
-- FUERA del formulario manual del Libro Diario. El formulario manual ya guarda
-- entry_time (ver 20260623000001_journal_entry_time.sql); estas funciones
-- quedaban sin hora, así que sus asientos no se podían desempatar dentro del
-- mismo día igual que los manuales.
--
-- Alcance (todas las funciones que hacen INSERT INTO journal_entries):
--   · create_sale                          (Ventas)
--   · void_sale                            (Anular venta)
--   · create_payable_with_journal          (Nueva CxP)
--   · register_payable_payment_with_journal(Registrar pago CxP)
--   · create_receivable_with_journal       (Nueva CxC)
--   · register_receivable_payment_with_journal (Registrar cobro CxC)
--   · transferir_inventario                (Transferencia entre cuentas)
--
-- Cada función se re-define IDÉNTICA a su última versión, solo agregando la
-- variable v_entry_time y la columna entry_time en su INSERT INTO journal_entries.
-- Mismo cálculo que el cliente (src/accounting/timezone.ts → nowTimeHHMM()).

-- ═══════════════════════════════════════════════════════════════════════════
-- create_sale
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_sale(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid    := auth.uid();
  v_company_id   uuid    := NULLIF(payload->>'company_id', '')::uuid;
  v_fecha        date    := (payload->>'fecha')::date;
  v_canal        text    := payload->>'canal';
  v_con_factura  boolean := COALESCE((payload->>'con_factura')::boolean, false);
  v_tipo_pago    text    := payload->>'tipo_pago';
  v_cliente      text    := payload->>'cliente_nombre';
  v_glosa        text    := payload->>'glosa';
  v_aux_entry_id uuid    := NULLIF(payload->>'aux_entry_id', '')::uuid;
  v_vendedor_member_id uuid := NULLIF(payload->>'vendedor_member_id', '')::uuid;
  v_total_cobrado numeric(18,2) := (payload->>'total_cobrado')::numeric;
  v_total_iva     numeric(18,2) := COALESCE((payload->>'total_iva')::numeric, 0);
  v_total_it      numeric(18,2) := COALESCE((payload->>'total_it')::numeric, 0);
  v_precio_neto   numeric(18,2) := (payload->>'precio_neto_total')::numeric;
  v_payment_account text := payload->>'payment_account';
  v_revenue_account text := payload->>'revenue_account';
  v_cogs_account    text := payload->>'cogs_account';
  v_entry_id    text;
  v_entry_time  text    := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
  v_numero      text;
  v_sale_id     uuid := gen_random_uuid();
  v_item        jsonb;
  v_product_id  uuid;
  v_metodo      text;
  v_cantidad    numeric(18,4);
  v_precio_u    numeric(18,4);
  v_subtotal    numeric(18,2);
  v_cuenta_inv  text;
  v_lot_cuenta  text;
  v_costo_u     numeric(18,6);
  v_costo_t     numeric(18,2);
  v_total_costo numeric(18,2) := 0;
  v_mov_id      uuid;
  v_stock       numeric;
  v_valor       numeric;
  v_lot         RECORD;
  v_remaining   numeric;
  v_take        numeric;
  v_inv_totals  jsonb := '{}'::jsonb;
  v_account_id  text;
  v_amount      numeric;
  v_iva         numeric;
  v_neto        numeric;
  v_it          numeric;
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

  IF v_payment_account IS NULL OR v_revenue_account IS NULL OR v_cogs_account IS NULL THEN
    RAISE EXCEPTION 'Cuentas no resueltas';
  END IF;

  IF v_vendedor_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE id = v_vendedor_member_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'El vendedor indicado no pertenece a esta empresa';
  END IF;

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);
  v_numero   := 'VTA-' || v_entry_id;

  INSERT INTO public.sales (id, user_id, company_id, numero, fecha, canal, con_factura, tipo_pago, cliente_nombre, aux_entry_id, glosa, total_cobrado, total_iva, total_it, precio_neto_total, estado, vendedor_member_id)
  VALUES (v_sale_id, v_user_id, v_company_id, v_numero, v_fecha, v_canal, v_con_factura, v_tipo_pago, v_cliente, v_aux_entry_id, v_glosa, v_total_cobrado, v_total_iva, v_total_it, v_precio_neto, 'confirmed', v_vendedor_member_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_metodo     := v_item->>'metodo_valuacion';
    v_cantidad   := (v_item->>'cantidad')::numeric;
    v_precio_u   := (v_item->>'precio_unitario_neto')::numeric;
    v_subtotal   := round((v_cantidad * v_precio_u)::numeric, 2);
    v_cuenta_inv := v_item->>'cuenta_inventario_id';

    IF v_metodo = 'CPP' THEN
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN cantidad WHEN tipo = 'SALIDA' THEN -cantidad ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN costo_total WHEN tipo = 'SALIDA' THEN -costo_total WHEN tipo = 'AJUSTE_COSTO' THEN costo_total ELSE 0 END), 0)
        INTO v_stock, v_valor
        FROM public.inventory_movements
       WHERE product_id = v_product_id AND company_id = v_company_id;

      IF v_stock < v_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para producto % (disponible %, solicitado %)', (v_item->>'product_nombre'), v_stock, v_cantidad;
      END IF;

      v_costo_u := CASE WHEN v_stock > 0 THEN round((v_valor / v_stock)::numeric, 6) ELSE 0 END;
      v_costo_t := round((v_costo_u * v_cantidad)::numeric, 2);
      v_mov_id  := gen_random_uuid();

      INSERT INTO public.inventory_movements (id, product_id, tipo, cantidad, costo_unitario, costo_total, metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
      VALUES (v_mov_id, v_product_id, 'SALIDA', v_cantidad, v_costo_u, v_costo_t, 'CPP', COALESCE(v_glosa, v_numero), v_entry_id, v_fecha, v_user_id, v_company_id);

      -- CPP: descarga la cuenta del producto
      IF v_cuenta_inv IS NOT NULL AND v_cuenta_inv <> '' THEN
        v_inv_totals := jsonb_set(v_inv_totals, ARRAY[v_cuenta_inv], to_jsonb(round((COALESCE((v_inv_totals ->> v_cuenta_inv)::numeric, 0) + v_costo_t)::numeric, 2)));
      END IF;

    ELSIF v_metodo = 'FIFO' THEN
      v_remaining := v_cantidad;
      v_costo_t   := 0;

      FOR v_lot IN
        SELECT id, cantidad_disponible, costo_unitario, cuenta_inventario_id FROM public.inventory_lots
         WHERE product_id = v_product_id AND company_id = v_company_id AND cantidad_disponible > 0
         ORDER BY fecha_ingreso ASC, created_at ASC
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(v_remaining, v_lot.cantidad_disponible);
        UPDATE public.inventory_lots SET cantidad_disponible = cantidad_disponible - v_take WHERE id = v_lot.id;
        v_mov_id := gen_random_uuid();
        INSERT INTO public.inventory_movements (id, product_id, inventory_lot_id, tipo, cantidad, costo_unitario, costo_total, metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
        VALUES (v_mov_id, v_product_id, v_lot.id, 'SALIDA', v_take, v_lot.costo_unitario, round((v_take * v_lot.costo_unitario)::numeric, 2), 'FIFO', COALESCE(v_glosa, v_numero), v_entry_id, v_fecha, v_user_id, v_company_id);
        v_costo_t   := v_costo_t + round((v_take * v_lot.costo_unitario)::numeric, 2);

        -- FIFO: descarga la cuenta REAL de cada lote (fallback: cuenta del producto)
        v_lot_cuenta := COALESCE(NULLIF(v_lot.cuenta_inventario_id, ''), v_cuenta_inv);
        IF v_lot_cuenta IS NOT NULL AND v_lot_cuenta <> '' THEN
          v_inv_totals := jsonb_set(v_inv_totals, ARRAY[v_lot_cuenta], to_jsonb(round((COALESCE((v_inv_totals ->> v_lot_cuenta)::numeric, 0) + round((v_take * v_lot.costo_unitario)::numeric, 2))::numeric, 2)));
        END IF;

        v_remaining := v_remaining - v_take;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Stock FIFO insuficiente para producto % (faltan %)', (v_item->>'product_nombre'), v_remaining;
      END IF;
      v_costo_u := CASE WHEN v_cantidad > 0 THEN round((v_costo_t / v_cantidad)::numeric, 6) ELSE 0 END;
    ELSE
      RAISE EXCEPTION 'Método de valuación inválido: %', v_metodo;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_nombre, product_codigo, cuenta_inventario_id, metodo_valuacion, cantidad, precio_unitario_neto, subtotal_neto, costo_unitario, costo_total, margen_bruto, inventory_movement_id)
    VALUES (v_sale_id, v_product_id, v_item->>'product_nombre', v_item->>'product_codigo', v_cuenta_inv, v_metodo, v_cantidad, v_precio_u, v_subtotal, v_costo_u, v_costo_t, round((v_subtotal - v_costo_t)::numeric, 2), v_mov_id);

    v_total_costo := v_total_costo + v_costo_t;
  END LOOP;

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, COALESCE(v_glosa, v_numero), v_entry_time);

  IF NOT v_con_factura THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_payment_account, v_total_cobrado, 0, v_numero);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_revenue_account, 0, v_total_cobrado, v_numero);
  ELSE
    v_iva  := round((v_total_cobrado * 0.13)::numeric, 2);
    v_neto := round((v_total_cobrado - v_iva)::numeric, 2);
    v_it   := round((v_total_cobrado * 0.03)::numeric, 2);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_payment_account, v_total_cobrado, 0, v_numero);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, 'P.3', 0, v_iva, 'IVA Débito Fiscal ' || v_numero);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_revenue_account, 0, v_neto, v_numero);
  END IF;

  IF v_total_costo > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_cogs_account, v_total_costo, 0, 'Costo ' || v_numero);
    FOR v_account_id, v_amount IN SELECT key, value::numeric FROM jsonb_each_text(v_inv_totals) LOOP
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, v_account_id, 0, v_amount, 'Salida inventario ' || v_numero);
    END LOOP;
  END IF;

  IF v_con_factura THEN
    v_it := round((v_total_cobrado * 0.03)::numeric, 2);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, 'G.3', v_it, 0, 'IT ' || v_numero);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo) VALUES (v_entry_id, 'P.2', 0, v_it, 'IT por pagar ' || v_numero);
  END IF;

  UPDATE public.sales SET total_costo = v_total_costo, journal_entry_id = v_entry_id WHERE id = v_sale_id;

  -- Auto-crear cuenta por cobrar para ventas al crédito (todos los canales)
  IF v_tipo_pago IN ('cxc', 'cxc_electronica', 'cxc_pedido', 'cxc_licitaciones') THEN
    INSERT INTO public.receivables (company_id, user_id, customer_id, sale_id, numero_documento, fecha_emision, fecha_vencimiento, monto_original, monto_pendiente, moneda, estado)
    VALUES (v_company_id, v_user_id, NULLIF(payload->>'customer_id', '')::uuid, v_sale_id, v_numero, v_fecha, NULL, v_total_cobrado, v_total_cobrado, 'BOB', 'open');
  END IF;

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'numero', v_numero);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- void_sale
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_entry_time   text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
  v_sale         RECORD;   -- includes company_id via SELECT *
  v_new_entry_id text;
  v_line         RECORD;
  v_item         RECORD;
  v_fifo_mov     RECORD;   -- each SALIDA movement per lot (Issue 2)
  v_lot_exists   boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_sale
    FROM public.sales
   WHERE id = p_sale_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_sale.estado = 'voided' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;
  IF v_sale.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Venta sin asiento asociado';
  END IF;

  -- Step 1-2: new entry ID (company-aware) + reversal journal entry
  v_new_entry_id := public.next_journal_entry_id(
    v_user_id, CURRENT_DATE, v_sale.company_id
  );

  INSERT INTO public.journal_entries (
    id,
    user_id,
    company_id,
    date,
    memo,
    void_of,
    entry_time
  ) VALUES (
    v_new_entry_id,
    v_user_id,
    v_sale.company_id,
    CURRENT_DATE,
    'Anulación ' || v_sale.numero || COALESCE(' — ' || p_reason, ''),
    v_sale.journal_entry_id,
    v_entry_time
  );

  -- Step 3: copy lines with debit/credit swapped
  -- journal_lines has no company_id — inherits via entry_id FK
  FOR v_line IN
    SELECT account_id, debit, credit, line_memo
      FROM public.journal_lines
     WHERE entry_id = v_sale.journal_entry_id
  LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
    VALUES (
      v_new_entry_id,
      v_line.account_id,
      v_line.credit,
      v_line.debit,
      'Anulación: ' || COALESCE(v_line.line_memo, '')
    );
  END LOOP;

  -- Step 4: restore inventory per sale_item
  FOR v_item IN
    SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    IF v_item.metodo_valuacion = 'CPP' THEN
      -- CPP: one reversal ENTRADA movement for the whole item
      INSERT INTO public.inventory_movements (
        product_id,
        inventory_lot_id,
        tipo,
        cantidad,
        costo_unitario,
        costo_total,
        metodo_valuacion,
        referencia,
        journal_entry_id,
        fecha,
        user_id,
        company_id
      ) VALUES (
        v_item.product_id,
        NULL,
        'ENTRADA',
        v_item.cantidad,
        COALESCE(v_item.costo_unitario, 0),
        COALESCE(v_item.costo_total, 0),
        'CPP',
        'Reversión ' || v_sale.numero,
        v_new_entry_id,
        CURRENT_DATE,
        v_user_id,
        v_sale.company_id
      );

    ELSIF v_item.metodo_valuacion = 'FIFO' THEN
      -- Issue 2 fix: loop over ALL SALIDA movements that the
      -- original sale created for this product. This correctly
      -- restores every lot consumed, not just the last one.
      FOR v_fifo_mov IN
        SELECT inventory_lot_id, cantidad, costo_unitario
          FROM public.inventory_movements
         WHERE journal_entry_id = v_sale.journal_entry_id
           AND product_id       = v_item.product_id
           AND tipo             = 'SALIDA'
           AND user_id          = v_user_id
      LOOP
        -- Reversal ENTRADA movement for this lot slice
        INSERT INTO public.inventory_movements (
          product_id,
          inventory_lot_id,
          tipo,
          cantidad,
          costo_unitario,
          costo_total,
          metodo_valuacion,
          referencia,
          journal_entry_id,
          fecha,
          user_id,
          company_id
        ) VALUES (
          v_item.product_id,
          v_fifo_mov.inventory_lot_id,
          'ENTRADA',
          v_fifo_mov.cantidad,
          v_fifo_mov.costo_unitario,
          round((v_fifo_mov.cantidad * v_fifo_mov.costo_unitario)::numeric, 2),
          'FIFO',
          'Reversión ' || v_sale.numero,
          v_new_entry_id,
          CURRENT_DATE,
          v_user_id,
          v_sale.company_id
        );

        -- Restore the lot's available quantity
        IF v_fifo_mov.inventory_lot_id IS NOT NULL THEN
          SELECT EXISTS(
            SELECT 1 FROM public.inventory_lots
             WHERE id = v_fifo_mov.inventory_lot_id
          ) INTO v_lot_exists;

          IF v_lot_exists THEN
            UPDATE public.inventory_lots
               SET cantidad_disponible = cantidad_disponible + v_fifo_mov.cantidad
             WHERE id = v_fifo_mov.inventory_lot_id;
          ELSE
            -- Lot was deleted since the original sale — recreate it
            INSERT INTO public.inventory_lots (
              product_id,
              cantidad_inicial,
              cantidad_disponible,
              costo_unitario,
              fecha_ingreso,
              user_id,
              company_id
            ) VALUES (
              v_item.product_id,
              v_fifo_mov.cantidad,
              v_fifo_mov.cantidad,
              v_fifo_mov.costo_unitario,
              CURRENT_DATE,
              v_user_id,
              v_sale.company_id
            );
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Step 5: mark sale voided
  UPDATE public.sales
     SET estado                = 'voided',
         void_reason           = p_reason,
         void_journal_entry_id = v_new_entry_id
   WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- create_payable_with_journal
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_entry_time    text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
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

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'CxP ' || v_numero || ' - ' || v_proveedor, v_entry_time);

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

-- ═══════════════════════════════════════════════════════════════════════════
-- register_payable_payment_with_journal
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_entry_time    text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
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

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'Pago CxP ' || v_pay.numero_documento || ' - ' || v_pay.proveedor_nombre, v_entry_time);

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

-- ═══════════════════════════════════════════════════════════════════════════
-- create_receivable_with_journal
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_entry_time     text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
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

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'CxC ' || v_numero, v_entry_time);

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

-- ═══════════════════════════════════════════════════════════════════════════
-- register_receivable_payment_with_journal
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_entry_time    text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
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

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, 'Cobro CxC ' || v_rec.numero_documento, v_entry_time);

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

-- ═══════════════════════════════════════════════════════════════════════════
-- transferir_inventario
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.transferir_inventario(
  p_company_id     uuid,
  p_product_id     uuid,
  p_cuenta_origen  text,
  p_cuenta_destino text,
  p_cantidad       numeric,
  p_fecha          date,
  p_glosa          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_metodo    text;
  v_prod_nom  text;
  v_prod_cod  text;
  v_disp      numeric;
  v_remaining numeric;
  v_take      numeric;
  v_lot       RECORD;
  v_new_lot   uuid;
  v_costo_total numeric(18,2) := 0;
  v_entry_id  text;
  v_entry_time text := to_char(now() AT TIME ZONE 'America/La_Paz', 'HH24:MI');
  v_ref       text;
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
          WHERE mp.company_member_id = cm.id AND mp.module = 'inventory' AND mp.can_edit = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para transferir inventario';
  END IF;

  IF p_cuenta_origen IS NULL OR p_cuenta_destino IS NULL OR p_cuenta_origen = '' OR p_cuenta_destino = '' THEN
    RAISE EXCEPTION 'Cuentas de origen y destino requeridas';
  END IF;
  IF p_cuenta_origen = p_cuenta_destino THEN
    RAISE EXCEPTION 'La cuenta de origen y destino no pueden ser la misma';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;

  -- Cuentas contables deben existir en la empresa
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = p_cuenta_origen AND a.company_id = p_company_id) THEN
    RAISE EXCEPTION 'La cuenta de origen "%" no existe en esta empresa', p_cuenta_origen;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = p_cuenta_destino AND a.company_id = p_company_id) THEN
    RAISE EXCEPTION 'La cuenta de destino "%" no existe en esta empresa', p_cuenta_destino;
  END IF;

  SELECT metodo_valuacion, nombre, codigo INTO v_metodo, v_prod_nom, v_prod_cod
    FROM public.products WHERE id = p_product_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en esta empresa';
  END IF;
  IF v_metodo <> 'FIFO' THEN
    RAISE EXCEPTION 'La transferencia entre cuentas solo está disponible para productos FIFO';
  END IF;

  -- Stock disponible en la cuenta origen
  SELECT COALESCE(SUM(cantidad_disponible), 0) INTO v_disp
    FROM public.inventory_lots
   WHERE product_id = p_product_id AND company_id = p_company_id
     AND cantidad_disponible > 0
     AND COALESCE(cuenta_inventario_id, '') = p_cuenta_origen;

  IF v_disp < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente en la cuenta origen (disponible %, solicitado %)', v_disp, p_cantidad;
  END IF;

  v_ref := COALESCE(NULLIF(p_glosa, ''), 'Transferencia ' || p_cuenta_origen || ' → ' || p_cuenta_destino);
  v_remaining := p_cantidad;

  -- Cabecera del asiento primero (los movimientos referencian journal_entry_id)
  v_entry_id := public.next_journal_entry_id(v_user_id, p_fecha, p_company_id);
  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo, entry_time)
  VALUES (v_entry_id, v_user_id, p_company_id, p_fecha,
          'Transferencia inventario ' || COALESCE(v_prod_cod, '') || ' ' || COALESCE(v_prod_nom, '') ||
          ' (' || p_cantidad || ' u) ' || p_cuenta_origen || ' → ' || p_cuenta_destino,
          v_entry_time);

  FOR v_lot IN
    SELECT id, cantidad_disponible, costo_unitario, fecha_ingreso
      FROM public.inventory_lots
     WHERE product_id = p_product_id AND company_id = p_company_id
       AND cantidad_disponible > 0
       AND COALESCE(cuenta_inventario_id, '') = p_cuenta_origen
     ORDER BY fecha_ingreso ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_lot.cantidad_disponible);

    -- Descontar del lote origen
    UPDATE public.inventory_lots
       SET cantidad_disponible = cantidad_disponible - v_take
     WHERE id = v_lot.id;

    -- Lote espejo en la cuenta destino (preserva costo y fecha => FIFO intacto)
    INSERT INTO public.inventory_lots
      (id, product_id, fecha_ingreso, cantidad_inicial, cantidad_disponible, costo_unitario, cuenta_inventario_id, user_id, company_id)
    VALUES
      (gen_random_uuid(), p_product_id, v_lot.fecha_ingreso, v_take, v_take, v_lot.costo_unitario, p_cuenta_destino, v_user_id, p_company_id)
    RETURNING id INTO v_new_lot;

    -- Movimientos ligados a cada lote y al asiento
    INSERT INTO public.inventory_movements
      (id, product_id, inventory_lot_id, tipo, cantidad, costo_unitario, costo_total, metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
    VALUES
      (gen_random_uuid(), p_product_id, v_lot.id, 'SALIDA', v_take, v_lot.costo_unitario, round((v_take * v_lot.costo_unitario)::numeric, 2), 'FIFO', v_ref, v_entry_id, p_fecha, v_user_id, p_company_id),
      (gen_random_uuid(), p_product_id, v_new_lot, 'ENTRADA', v_take, v_lot.costo_unitario, round((v_take * v_lot.costo_unitario)::numeric, 2), 'FIFO', v_ref, v_entry_id, p_fecha, v_user_id, p_company_id);

    v_costo_total := round((v_costo_total + round((v_take * v_lot.costo_unitario)::numeric, 2))::numeric, 2);
    v_remaining   := v_remaining - v_take;
  END LOOP;

  -- Asiento contable: Debe cuenta destino / Haber cuenta origen, al costo movido
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, p_cuenta_destino, v_costo_total, 0, 'Ingreso por transferencia ' || COALESCE(v_prod_cod, ''));
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_memo)
  VALUES (v_entry_id, p_cuenta_origen, 0, v_costo_total, 'Salida por transferencia ' || COALESCE(v_prod_cod, ''));

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'costo_total', v_costo_total,
    'cantidad', p_cantidad
  );
END;
$$;
