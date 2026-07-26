-- Ventas recientes de productos del catálogo, a nivel de TODA la empresa.
-- Sirve para avisar a los vendedores que algo se vendió (o se agotó) y dejen de
-- promocionarlo.
--
-- Deliberadamente NO expone: vendedor, cliente, precio de venta, costo ni margen.
-- Solo "qué producto y cuántas unidades salieron, y cuándo" — lo mínimo para
-- decidir si seguir ofreciéndolo. Así se mantiene el aislamiento entre vendedores
-- que ya tienen get_my_ventas / get_catalog_productos.
--
-- SECURITY DEFINER bypasea RLS: el guard real es el EXISTS sobre company_members,
-- que exige que quien llama sea miembro de esa empresa.

CREATE OR REPLACE FUNCTION public.get_catalog_ventas_recientes(
  p_company_id uuid,
  p_dias       int DEFAULT 7
)
RETURNS TABLE(product_id uuid, nombre text, cantidad numeric, fecha date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    si.product_id,
    max(si.product_nombre)      AS nombre,
    SUM(si.cantidad)::numeric   AS cantidad,
    s.fecha
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.products pr   ON pr.id = si.product_id
  WHERE s.company_id = p_company_id
    AND s.estado = 'confirmed'
    AND s.fecha >= (CURRENT_DATE - GREATEST(COALESCE(p_dias, 7), 0))
    -- Solo productos que el vendedor efectivamente ve en el catálogo.
    AND pr.company_id = p_company_id
    AND pr.mostrar_en_catalogo = true
    AND pr.status = 'activo'
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
    )
  GROUP BY si.product_id, s.fecha
  ORDER BY s.fecha DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_ventas_recientes(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_ventas_recientes(uuid, int) TO authenticated;
