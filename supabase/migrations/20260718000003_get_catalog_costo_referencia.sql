-- Costo sin IVA e IVA importado por producto, reconstruidos desde los datos
-- reales del embarque (inventory_lots -> shipments.data jsonb), para
-- autocompletar la calculadora de ganancia del Catálogo de Ventas en vez de
-- transcribirlos a mano. Pondera por cantidad_disponible (si el producto ya
-- no tiene stock disponible, usa cantidad_inicial como respaldo) — así un
-- producto con varios lotes de distinto costo/IVA tiene un valor de
-- referencia razonable.
--
-- Limitación conocida: solo funciona para productos con lotes rastreables a
-- un embarque (shipment_id/shipment_product_id poblados en inventory_lots).
-- Productos CPP o creados manualmente sin pasar por Embarques no tienen esta
-- traza — para esos, el owner sigue ingresando el costo/IVA a mano.
CREATE OR REPLACE FUNCTION public.get_catalog_costo_referencia(p_company_id uuid)
RETURNS TABLE(product_id uuid, costo_sin_iva numeric, iva_importado numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH lots AS (
    SELECT
      il.product_id,
      il.costo_unitario,
      il.cantidad_disponible,
      il.cantidad_inicial,
      CASE WHEN sp IS NOT NULL AND (sp->>'cantidad')::numeric > 0
        THEN (sp->>'iva_monto')::numeric / (sp->>'cantidad')::numeric
        ELSE NULL
      END AS iva_unitario
    FROM public.inventory_lots il
    LEFT JOIN public.shipments s ON s.id = il.shipment_id
    LEFT JOIN LATERAL jsonb_array_elements(s.data->'products') sp
      ON (sp->>'id')::uuid = il.shipment_product_id
    WHERE il.company_id = p_company_id
  ),
  totales AS (
    SELECT product_id, SUM(cantidad_disponible) AS total_disponible
    FROM lots
    GROUP BY product_id
  ),
  ponderado AS (
    SELECT
      l.product_id,
      l.costo_unitario,
      l.iva_unitario,
      CASE WHEN t.total_disponible > 0 THEN l.cantidad_disponible ELSE l.cantidad_inicial END AS peso
    FROM lots l
    JOIN totales t ON t.product_id = l.product_id
  )
  SELECT
    product_id,
    round((SUM(costo_unitario * peso) / NULLIF(SUM(peso), 0))::numeric, 4) AS costo_sin_iva,
    round((SUM(COALESCE(iva_unitario, 0) * peso) / NULLIF(SUM(peso), 0))::numeric, 4) AS iva_importado
  FROM ponderado
  WHERE EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
  )
  GROUP BY product_id
  HAVING SUM(peso) > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_costo_referencia(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_costo_referencia(uuid) TO authenticated;
