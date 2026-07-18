-- Ventas propias del vendedor autenticado, para la pestaña "Mis Ventas" del
-- Catálogo de Ventas. Se resuelve auth.uid() -> company_members.id del
-- llamante DENTRO de la función (no vía RLS de `sales`/`sale_items`, que es
-- a nivel de empresa completa) — así un vendedor nunca puede ver ventas de
-- otros ni datos de costo/margen, solo lo que devuelve este SELECT acotado.
CREATE OR REPLACE FUNCTION public.get_my_ventas(p_company_id uuid)
RETURNS TABLE(fecha date, numero text, productos text, comision numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    s.fecha,
    s.numero,
    string_agg(si.product_nombre || ' x' || si.cantidad::text, ', ' ORDER BY si.product_nombre) AS productos,
    round(SUM(COALESCE(p.comision_bs, 0) * si.cantidad)::numeric, 2) AS comision
  FROM public.sales s
  JOIN public.company_members cm ON cm.id = s.vendedor_member_id
  JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE s.company_id = p_company_id
    AND s.estado = 'confirmed'
    AND cm.company_id = p_company_id
    AND cm.user_id = auth.uid()
  GROUP BY s.id, s.fecha, s.numero
  ORDER BY s.fecha DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_ventas(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_ventas(uuid) TO authenticated;
