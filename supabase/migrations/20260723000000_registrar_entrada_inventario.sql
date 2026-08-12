-- Entrada manual de inventario que SÍ crea el lote FIFO.
-- El modal de movimiento manual insertaba solo un inventory_movements con
-- metodo_valuacion='CPP' fijo y nunca creaba inventory_lots, así que en un
-- producto FIFO (el default) la venta no encontraba stock. Esta RPC crea, de
-- forma atómica y según el método real del producto:
--   · FIFO → un lote nuevo + su movimiento ENTRADA ligado al lote
--   · CPP  → solo el movimiento ENTRADA
-- Sirve para registrar como inventario una compra local que ya se asentó en el
-- Libro Diario (se puede enlazar el asiento). NO genera ningún asiento contable.
CREATE OR REPLACE FUNCTION public.registrar_entrada_inventario(
  p_company_id       uuid,
  p_product_id       uuid,
  p_cantidad         numeric,
  p_costo_unitario   numeric,
  p_fecha            date,
  p_referencia       text,
  p_journal_entry_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_metodo  text;
  v_lot_id  uuid;
  v_costo_total numeric(18,2);
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
    RAISE EXCEPTION 'No autorizado para registrar movimientos de inventario';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  IF p_costo_unitario IS NULL OR p_costo_unitario <= 0 THEN
    RAISE EXCEPTION 'El costo unitario debe ser mayor a cero';
  END IF;

  SELECT metodo_valuacion INTO v_metodo
    FROM public.products WHERE id = p_product_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en esta empresa';
  END IF;

  IF p_journal_entry_id IS NOT NULL AND p_journal_entry_id <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = p_journal_entry_id AND je.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'El asiento "%" no existe en esta empresa', p_journal_entry_id;
    END IF;
  END IF;

  v_costo_total := round((p_cantidad * p_costo_unitario)::numeric, 2);

  IF v_metodo = 'FIFO' THEN
    INSERT INTO public.inventory_lots
      (id, product_id, fecha_ingreso, cantidad_inicial, cantidad_disponible, costo_unitario, user_id, company_id)
    VALUES
      (gen_random_uuid(), p_product_id, p_fecha, p_cantidad, p_cantidad, p_costo_unitario, v_user_id, p_company_id)
    RETURNING id INTO v_lot_id;

    INSERT INTO public.inventory_movements
      (id, product_id, inventory_lot_id, tipo, cantidad, costo_unitario, costo_total,
       metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
    VALUES
      (gen_random_uuid(), p_product_id, v_lot_id, 'ENTRADA', p_cantidad, p_costo_unitario, v_costo_total,
       'FIFO', COALESCE(NULLIF(p_referencia, ''), 'Entrada manual'), NULLIF(p_journal_entry_id, ''), p_fecha, v_user_id, p_company_id);
  ELSE
    INSERT INTO public.inventory_movements
      (id, product_id, tipo, cantidad, costo_unitario, costo_total,
       metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
    VALUES
      (gen_random_uuid(), p_product_id, 'ENTRADA', p_cantidad, p_costo_unitario, v_costo_total,
       'CPP', COALESCE(NULLIF(p_referencia, ''), 'Entrada manual'), NULLIF(p_journal_entry_id, ''), p_fecha, v_user_id, p_company_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'metodo', v_metodo, 'lot_id', v_lot_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_entrada_inventario(uuid, uuid, numeric, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_entrada_inventario(uuid, uuid, numeric, numeric, date, text, text) TO authenticated;
