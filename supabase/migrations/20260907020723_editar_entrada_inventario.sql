-- Permite corregir una entrada manual de inventario FIFO (typos de cantidad/costo)
-- sin recurrir a SQL directo. Solo aplica a lotes SIN consumo (cantidad_disponible =
-- cantidad_inicial) y que no provengan de un embarque importado — esos se corrigen
-- desde el módulo de Embarques. Igual que registrar_entrada_inventario, NO genera
-- ningún asiento contable: si ya existe un asiento enlazado, se conserva tal cual
-- salvo que se pase uno nuevo explícitamente.
CREATE OR REPLACE FUNCTION public.editar_entrada_inventario(
  p_company_id       uuid,
  p_lot_id           uuid,
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
  v_user_id      uuid := auth.uid();
  v_lot          public.inventory_lots%ROWTYPE;
  v_mov          public.inventory_movements%ROWTYPE;
  v_costo_total  numeric(18,2);
  v_old_cantidad numeric;
  v_old_costo_unitario numeric;
  v_old_costo_total    numeric;
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
    RAISE EXCEPTION 'No autorizado para editar movimientos de inventario';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  IF p_costo_unitario IS NULL OR p_costo_unitario <= 0 THEN
    RAISE EXCEPTION 'El costo unitario debe ser mayor a cero';
  END IF;

  SELECT * INTO v_lot FROM public.inventory_lots
   WHERE id = p_lot_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado en esta empresa';
  END IF;

  IF v_lot.cantidad_disponible <> v_lot.cantidad_inicial THEN
    RAISE EXCEPTION 'No se puede editar: el lote ya tiene salidas o transferencias registradas';
  END IF;

  IF v_lot.shipment_id IS NOT NULL OR v_lot.shipment_product_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este lote proviene de un embarque importado; corrígelo desde el módulo de Embarques';
  END IF;

  SELECT * INTO v_mov FROM public.inventory_movements
   WHERE inventory_lot_id = p_lot_id AND tipo = 'ENTRADA' AND company_id = p_company_id
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el movimiento de entrada de este lote';
  END IF;

  IF p_journal_entry_id IS NOT NULL AND p_journal_entry_id <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = p_journal_entry_id AND je.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'El asiento "%" no existe en esta empresa', p_journal_entry_id;
    END IF;
  END IF;

  v_old_cantidad       := v_lot.cantidad_inicial;
  v_old_costo_unitario := v_lot.costo_unitario;
  v_old_costo_total    := v_mov.costo_total;
  v_costo_total        := round((p_cantidad * p_costo_unitario)::numeric, 2);

  UPDATE public.inventory_lots
     SET cantidad_inicial = p_cantidad,
         cantidad_disponible = p_cantidad,
         costo_unitario = p_costo_unitario,
         fecha_ingreso = p_fecha
   WHERE id = p_lot_id;

  UPDATE public.inventory_movements
     SET cantidad = p_cantidad,
         costo_unitario = p_costo_unitario,
         costo_total = v_costo_total,
         fecha = p_fecha,
         referencia = COALESCE(NULLIF(p_referencia, ''), referencia),
         journal_entry_id = CASE WHEN p_journal_entry_id IS NOT NULL THEN NULLIF(p_journal_entry_id, '') ELSE journal_entry_id END
   WHERE id = v_mov.id;

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', p_lot_id,
    'old_cantidad', v_old_cantidad, 'new_cantidad', p_cantidad,
    'old_costo_unitario', v_old_costo_unitario, 'new_costo_unitario', p_costo_unitario,
    'old_costo_total', v_old_costo_total, 'new_costo_total', v_costo_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_entrada_inventario(uuid, uuid, numeric, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_entrada_inventario(uuid, uuid, numeric, numeric, date, text, text) TO authenticated;
