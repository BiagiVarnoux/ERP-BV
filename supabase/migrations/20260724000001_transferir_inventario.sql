-- Transferencia de inventario entre cuentas (parcial o total).
-- Mueve N unidades de un producto de una cuenta de inventario a otra
-- (p.ej. Inventario-Licitaciones A.4.3 → Inventario-Otros A.4.6) y registra
-- automáticamente el asiento contable (Debe cuenta destino / Haber cuenta origen)
-- al COSTO de las unidades movidas.
--
-- Mecánica FIFO: consume las unidades de los lotes de la cuenta ORIGEN en orden
-- FIFO y, por cada lote consumido, crea un lote espejo en la cuenta DESTINO
-- preservando su costo unitario y su fecha de ingreso (mantiene intacta la
-- estratificación FIFO y evita cualquier redondeo de costo). Cada movimiento
-- queda ligado a su lote: SALIDA en el lote origen, ENTRADA en el lote destino.
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
  INSERT INTO public.journal_entries (id, user_id, company_id, date, memo)
  VALUES (v_entry_id, v_user_id, p_company_id, p_fecha,
          'Transferencia inventario ' || COALESCE(v_prod_cod, '') || ' ' || COALESCE(v_prod_nom, '') ||
          ' (' || p_cantidad || ' u) ' || p_cuenta_origen || ' → ' || p_cuenta_destino);

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

REVOKE EXECUTE ON FUNCTION public.transferir_inventario(uuid, uuid, text, text, numeric, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transferir_inventario(uuid, uuid, text, text, numeric, date, text) TO authenticated;
