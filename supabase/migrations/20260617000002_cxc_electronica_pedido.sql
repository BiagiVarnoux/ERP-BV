-- Agrega cxc_electronica (A.5.2) y cxc_pedido (A.5.3) como tipos de pago CxC
-- que auto-generan una cuenta por cobrar al registrar una venta.
-- Solo cambia la condición IF v_tipo_pago IN (...) en la última sección.

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
  v_total_cobrado numeric(18,2) := (payload->>'total_cobrado')::numeric;
  v_total_iva     numeric(18,2) := COALESCE((payload->>'total_iva')::numeric, 0);
  v_total_it      numeric(18,2) := COALESCE((payload->>'total_it')::numeric, 0);
  v_precio_neto   numeric(18,2) := (payload->>'precio_neto_total')::numeric;
  v_payment_account text := payload->>'payment_account';
  v_revenue_account text := payload->>'revenue_account';
  v_cogs_account    text := payload->>'cogs_account';
  v_entry_id    text;
  v_numero      text;
  v_sale_id     uuid := gen_random_uuid();
  v_item        jsonb;
  v_product_id  uuid;
  v_metodo      text;
  v_cantidad    numeric(18,4);
  v_precio_u    numeric(18,4);
  v_subtotal    numeric(18,2);
  v_cuenta_inv  text;
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

  v_entry_id := public.next_journal_entry_id(v_user_id, v_fecha, v_company_id);
  v_numero   := 'VTA-' || v_entry_id;

  INSERT INTO public.sales (id, user_id, company_id, numero, fecha, canal, con_factura, tipo_pago, cliente_nombre, aux_entry_id, glosa, total_cobrado, total_iva, total_it, precio_neto_total, estado)
  VALUES (v_sale_id, v_user_id, v_company_id, v_numero, v_fecha, v_canal, v_con_factura, v_tipo_pago, v_cliente, v_aux_entry_id, v_glosa, v_total_cobrado, v_total_iva, v_total_it, v_precio_neto, 'confirmed');

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

    ELSIF v_metodo = 'FIFO' THEN
      v_remaining := v_cantidad;
      v_costo_t   := 0;

      FOR v_lot IN
        SELECT id, cantidad_disponible, costo_unitario FROM public.inventory_lots
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

    IF v_cuenta_inv IS NOT NULL AND v_cuenta_inv <> '' THEN
      v_inv_totals := jsonb_set(v_inv_totals, ARRAY[v_cuenta_inv], to_jsonb(round((COALESCE((v_inv_totals ->> v_cuenta_inv)::numeric, 0) + v_costo_t)::numeric, 2)));
    END IF;
  END LOOP;

  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, v_company_id, v_fecha, COALESCE(v_glosa, v_numero));

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

REVOKE EXECUTE ON FUNCTION public.create_sale(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_sale(jsonb) TO authenticated;
