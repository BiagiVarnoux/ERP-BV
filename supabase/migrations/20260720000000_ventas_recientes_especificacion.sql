-- Agrega la especificación (variante: color/almacenamiento/etc.) a los avisos de
-- ventas recientes, para que los vendedores no confundan variantes del mismo
-- modelo (ej. MacBook Air M5 "Medianoche" vs "Plateado").
--
-- Cambia la firma de retorno de la función, así que hay que DROP + CREATE
-- (CREATE OR REPLACE no permite cambiar las columnas devueltas).
-- `especificacion` ya es visible en el catálogo (get_catalog_productos), no es
-- dato sensible.

DROP FUNCTION IF EXISTS public.get_catalog_ventas_recientes(uuid, int);

CREATE FUNCTION public.get_catalog_ventas_recientes(
  p_company_id uuid,
  p_dias       int DEFAULT 7
)
RETURNS TABLE(product_id uuid, nombre text, especificacion text, cantidad numeric, fecha date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    si.product_id,
    max(si.product_nombre)      AS nombre,
    max(pr.especificacion)      AS especificacion,
    SUM(si.cantidad)::numeric   AS cantidad,
    s.fecha
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  JOIN public.products pr   ON pr.id = si.product_id
  WHERE s.company_id = p_company_id
    AND s.estado = 'confirmed'
    AND s.fecha >= (CURRENT_DATE - GREATEST(COALESCE(p_dias, 7), 0))
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
