-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3b — RPC: ventas reales atribuidas por embarque (cadena exacta)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Reemplaza el "fuzzy match por nombre" del Análisis de Inversión por la cadena
-- exacta: inventory_lots(shipment_id, shipment_product_id) → inventory_movements
-- (SALIDA por lote) → sales (por journal_entry_id, confirmadas) → sale_items
-- (precio por producto). Devuelve, por producto del embarque (shipment_product_id),
-- las ventas REALMENTE atribuibles a ESTE embarque (no las de otros embarques del
-- mismo producto).
--
-- Seguridad (S8): p_company_id + filtro WHERE company_id = p_company_id en todo;
-- SECURITY DEFINER, por lo que la membresía se valida explícitamente arriba.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_shipment_realized_sales(uuid, uuid);

CREATE FUNCTION public.get_shipment_realized_sales(p_company_id uuid, p_shipment_id uuid)
RETURNS TABLE (
  shipment_product_id uuid,
  unidades        numeric,
  ingreso_neto    numeric,
  costo           numeric,
  con_factura     numeric,
  sin_factura     numeric,
  primera_entrada date,
  ultima_venta    date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No autorizado: el usuario no pertenece a la empresa indicada';
  END IF;

  RETURN QUERY
  WITH salidas AS (
    SELECT il.shipment_product_id AS spid,
           m.cantidad, m.costo_total, m.product_id, m.journal_entry_id, m.fecha
    FROM public.inventory_movements m
    JOIN public.inventory_lots il ON il.id = m.inventory_lot_id
    WHERE m.company_id = p_company_id
      AND m.tipo = 'SALIDA'
      AND il.shipment_id = p_shipment_id
      AND il.shipment_product_id IS NOT NULL
  ),
  priced AS (
    SELECT s.spid, s.cantidad, s.costo_total, s.fecha,
           COALESCE(si.precio_unitario_neto, 0) AS precio_u,
           sa.con_factura
    FROM salidas s
    JOIN public.sales sa
      ON sa.journal_entry_id = s.journal_entry_id
     AND sa.company_id = p_company_id
     AND sa.estado = 'confirmed'
    LEFT JOIN public.sale_items si
      ON si.sale_id = sa.id AND si.product_id = s.product_id
  ),
  entradas AS (
    SELECT il.shipment_product_id AS spid, MIN(il.fecha_ingreso) AS primera_entrada
    FROM public.inventory_lots il
    WHERE il.company_id = p_company_id AND il.shipment_id = p_shipment_id
      AND il.shipment_product_id IS NOT NULL
    GROUP BY il.shipment_product_id
  )
  SELECT p.spid,
         SUM(p.cantidad),
         SUM(p.cantidad * p.precio_u),
         SUM(p.costo_total),
         SUM(p.cantidad) FILTER (WHERE p.con_factura),
         SUM(p.cantidad) FILTER (WHERE NOT COALESCE(p.con_factura, false)),
         e.primera_entrada,
         MAX(p.fecha)
  FROM priced p
  JOIN entradas e ON e.spid = p.spid
  GROUP BY p.spid, e.primera_entrada;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shipment_realized_sales(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_shipment_realized_sales(uuid, uuid) TO authenticated;
