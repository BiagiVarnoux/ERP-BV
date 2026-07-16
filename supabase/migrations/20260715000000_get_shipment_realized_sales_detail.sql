-- ════════════════════════════════════════════════════════════════════════════
-- Detalle de ventas reales por fecha, para construir el flujo de caja REAL
-- (VAN/TIR reales) del Análisis de Inversión con la misma granularidad mensual
-- que ya usa el flujo cotizado (buildFlujos). Complementa a
-- get_shipment_realized_sales (que agrega todo en un solo total por producto)
-- con una fila por (producto, fecha de venta).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_shipment_realized_sales_detail(uuid, uuid);

CREATE FUNCTION public.get_shipment_realized_sales_detail(p_company_id uuid, p_shipment_id uuid)
RETURNS TABLE (
  shipment_product_id uuid,
  fecha           date,
  unidades        numeric,
  ingreso_neto    numeric,
  costo           numeric,
  con_factura     numeric,
  sin_factura     numeric
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
  )
  SELECT p.spid, p.fecha,
         SUM(p.cantidad),
         SUM(p.cantidad * p.precio_u),
         SUM(p.costo_total),
         SUM(p.cantidad) FILTER (WHERE p.con_factura),
         SUM(p.cantidad) FILTER (WHERE NOT COALESCE(p.con_factura, false))
  FROM priced p
  GROUP BY p.spid, p.fecha
  ORDER BY p.spid, p.fecha;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shipment_realized_sales_detail(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_shipment_realized_sales_detail(uuid, uuid) TO authenticated;
