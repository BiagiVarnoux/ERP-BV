-- FIFO como método real en todo el inventario + ajuste de costo (NIC 2) por lote.
--
-- CONTEXTO DEL BUG: ni el cierre de embarque (shipments/Index.tsx) ni el alta
-- manual de productos (NewProductModal.tsx) definían `metodo_valuacion`, así que
-- todo producto nuevo caía al DEFAULT de la tabla, que era 'CPP' — aunque su
-- lote y su movimiento se creaban como FIFO. Resultado: 11 productos activos
-- del embarque EMB-2026-005 marcados CPP con lotes FIFO. Al venderlos,
-- create_sale tomaba la rama CPP y NUNCA consumía el lote, rompiendo la
-- trazabilidad lote → embarque que usa el módulo de Inversiones.

-- ── 1. Default correcto (red de seguridad si algún código vuelve a omitirlo) ──
ALTER TABLE public.products ALTER COLUMN metodo_valuacion SET DEFAULT 'FIFO';

-- ── 2. Migrar los productos mal marcados ─────────────────────────────────────
-- Solo los que tienen lotes FIFO Y nunca se vendieron: si un producto marcado
-- CPP ya tuvo una SALIDA, su lote no fue descontado y migrarlo inflaría el
-- stock. Esos quedan fuera a propósito (hoy no existe ninguno).
UPDATE public.products p
SET metodo_valuacion = 'FIFO'
WHERE p.metodo_valuacion = 'CPP'
  AND EXISTS (SELECT 1 FROM public.inventory_lots il WHERE il.product_id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_movements m
    WHERE m.product_id = p.id AND m.tipo = 'SALIDA'
  );

-- ── 3. Ajuste de costo (NIC 2) sobre un lote FIFO ────────────────────────────
-- En FIFO cada lote lleva su propio costo, así que un costo posterior
-- (reparación, acondicionamiento) debe atribuirse a un lote concreto — no a un
-- promedio. Sube el costo de las unidades QUE QUEDAN; las ya vendidas
-- conservan su costo histórico (no se reexpresa el pasado).
-- Atómico: actualiza el lote e inserta el movimiento de auditoría, o ninguno.
CREATE OR REPLACE FUNCTION public.ajustar_costo_lote(
  p_company_id       uuid,
  p_lot_id           uuid,
  p_monto            numeric,
  p_fecha            date,
  p_concepto         text,
  p_journal_entry_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_lot         public.inventory_lots%ROWTYPE;
  v_nuevo_costo numeric(18,6);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- SECURITY DEFINER salta el RLS: el permiso se valida explícitamente acá.
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
    RAISE EXCEPTION 'No autorizado para ajustar costos de inventario';
  END IF;

  SELECT * INTO v_lot FROM public.inventory_lots
   WHERE id = p_lot_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado en esta empresa';
  END IF;
  IF v_lot.cantidad_disponible <= 0 THEN
    RAISE EXCEPTION 'El lote no tiene unidades disponibles — no se puede ajustar su costo';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del ajuste debe ser mayor a cero';
  END IF;

  IF p_journal_entry_id IS NOT NULL AND p_journal_entry_id <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = p_journal_entry_id AND je.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'El asiento "%" no existe en esta empresa', p_journal_entry_id;
    END IF;
  END IF;

  v_nuevo_costo := round((v_lot.costo_unitario + (p_monto / v_lot.cantidad_disponible))::numeric, 6);

  UPDATE public.inventory_lots
     SET costo_unitario = v_nuevo_costo
   WHERE id = p_lot_id;

  INSERT INTO public.inventory_movements
    (product_id, inventory_lot_id, tipo, cantidad, costo_unitario, costo_total,
     metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
  VALUES
    (v_lot.product_id, p_lot_id, 'AJUSTE_COSTO', 0, v_nuevo_costo, p_monto,
     'FIFO', COALESCE(NULLIF(p_concepto, ''), 'Ajuste de costo (NIC 2)'),
     NULLIF(p_journal_entry_id, ''), p_fecha, v_user_id, p_company_id);

  RETURN jsonb_build_object(
    'success', true,
    'costo_anterior', v_lot.costo_unitario,
    'nuevo_costo_unitario', v_nuevo_costo
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ajustar_costo_lote(uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ajustar_costo_lote(uuid, uuid, numeric, date, text, text) TO authenticated;
