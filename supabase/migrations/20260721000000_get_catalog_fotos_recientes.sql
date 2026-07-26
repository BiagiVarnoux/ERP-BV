-- Sesiones de fotos subidas recientemente a productos del catálogo, para avisar
-- a los vendedores que hay material nuevo que pueden usar para promocionar.
--
-- Una fila por sesión de fotos (sesion_id). Solo productos visibles en el catálogo.
-- No expone datos sensibles: producto, variante, nombre de la sesión y cuántas
-- fotos. Mismo patrón de seguridad que get_catalog_ventas_recientes
-- (SECURITY DEFINER + guard de membresía como única barrera).

CREATE OR REPLACE FUNCTION public.get_catalog_fotos_recientes(
  p_company_id uuid,
  p_dias       int DEFAULT 7
)
RETURNS TABLE(
  product_id     uuid,
  nombre         text,
  especificacion text,
  sesion_nombre  text,
  fotos          int,
  fecha          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    pr.id,
    pr.nombre,
    pr.especificacion,
    max(f.sesion_nombre)  AS sesion_nombre,
    count(*)::int         AS fotos,
    max(f.uploaded_at)    AS fecha
  FROM public.product_fotos f
  JOIN public.products pr ON pr.id = f.product_id
  WHERE f.company_id = p_company_id
    AND f.uploaded_at >= (now() - make_interval(days => GREATEST(COALESCE(p_dias, 7), 0)))
    AND pr.company_id = p_company_id
    AND pr.mostrar_en_catalogo = true
    AND pr.status = 'activo'
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
    )
  GROUP BY pr.id, pr.nombre, pr.especificacion, f.sesion_id
  ORDER BY fecha DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_fotos_recientes(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_fotos_recientes(uuid, int) TO authenticated;
