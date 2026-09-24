-- Catálogo de Ventas: (1) link externo al producto (Amazon, eBay, etc.) para
-- que el vendedor pueda consultar información sin salir del catálogo, y
-- (2) comisión variable — un % configurable por producto sobre la diferencia
-- entre lo que el vendedor realmente cobró y el precio mínimo autorizado.
-- La variable premia vender cerca del precio de lista y desincentiva rebajar
-- hasta el mínimo (ahí la variable es Bs 0); la fija (`comision_bs`, ya
-- existente) no cambia. Mismo nombre de columna que ya usan
-- `licitacion_productos`/`investment_analysis_items` (`link_producto`) para
-- mantener la convención del repo.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS link_producto text,
  ADD COLUMN IF NOT EXISTS comision_variable_pct numeric(5,2);

-- ─── get_catalog_productos: expone los 2 campos nuevos al vendedor ───────────
-- Cambia el tipo de retorno -> DROP + CREATE (CREATE OR REPLACE no permite
-- alterar RETURNS TABLE).
DROP FUNCTION IF EXISTS public.get_catalog_productos(uuid);
CREATE FUNCTION public.get_catalog_productos(p_company_id uuid)
RETURNS TABLE(
  id uuid, nombre text, especificacion text, condicion text,
  descripcion_catalogo text, precio_lista numeric,
  precio_minimo_negociacion numeric, comision_bs numeric,
  comision_variable_pct numeric, link_producto text,
  precio_con_factura numeric, precio_lista_anterior numeric,
  precio_actualizado_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id, p.nombre, p.especificacion, p.condicion,
         p.descripcion_catalogo, p.precio_lista,
         p.precio_minimo_negociacion, p.comision_bs,
         p.comision_variable_pct, p.link_producto,
         CASE WHEN p.precio_lista IS NOT NULL
           THEN round(((p.precio_lista - COALESCE(p.iva_importado_bs, 0)) / 0.84)::numeric, 2)
           ELSE NULL
         END AS precio_con_factura,
         p.precio_lista_anterior,
         p.precio_actualizado_at
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.mostrar_en_catalogo = true
    AND p.status = 'activo'
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_productos(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_productos(uuid) TO authenticated;

-- ─── get_my_ventas: separa comisión fija / variable / total ─────────────────
-- La variable se calcula por línea vendida:
--   % × GREATEST(precio_unitario_neto − precio_minimo_negociacion, 0)
-- Si el producto no tiene precio_minimo_negociacion cargado, no hay base
-- para calcular la variable (COALESCE lo deja en el propio precio de venta,
-- diferencia 0) — evita inflar comisión con un mínimo inexistente.
DROP FUNCTION IF EXISTS public.get_my_ventas(uuid);
CREATE FUNCTION public.get_my_ventas(p_company_id uuid)
RETURNS TABLE(fecha date, numero text, productos text, comision_fija numeric, comision_variable numeric, comision numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    s.fecha,
    s.numero,
    string_agg(si.product_nombre || ' x' || si.cantidad::text, ', ' ORDER BY si.product_nombre) AS productos,
    round(SUM(COALESCE(p.comision_bs, 0) * si.cantidad)::numeric, 2) AS comision_fija,
    round(SUM(
      GREATEST(si.precio_unitario_neto - COALESCE(p.precio_minimo_negociacion, si.precio_unitario_neto), 0)
      * COALESCE(p.comision_variable_pct, 0) / 100 * si.cantidad
    )::numeric, 2) AS comision_variable,
    round((
      SUM(COALESCE(p.comision_bs, 0) * si.cantidad)
      + SUM(
          GREATEST(si.precio_unitario_neto - COALESCE(p.precio_minimo_negociacion, si.precio_unitario_neto), 0)
          * COALESCE(p.comision_variable_pct, 0) / 100 * si.cantidad
        )
    )::numeric, 2) AS comision
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

-- ─── get_ventas_por_vendedor: agrega precio_unitario_neto ───────────────────
-- El reporte gerencial (VentasPorVendedorView.tsx) calcula la comisión del
-- lado del cliente uniendo esto con products.comision_bs/comision_variable_pct
-- ya seleccionados ahí mismo; para la variable necesita el precio real de
-- venta de cada línea, que esta función no devolvía todavía.
DROP FUNCTION IF EXISTS public.get_ventas_por_vendedor(uuid);
CREATE FUNCTION public.get_ventas_por_vendedor(p_company_id uuid)
RETURNS TABLE(
  sale_id uuid, numero text, fecha date, vendedor_member_id uuid,
  product_id uuid, product_nombre text, cantidad numeric, precio_unitario_neto numeric
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
      AND (
        cm.role_typed = 'owner'
        OR EXISTS (
          SELECT 1 FROM public.member_permissions mp
          WHERE mp.company_member_id = cm.id AND mp.module = 'catalogo_ventas' AND mp.can_edit = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT s.id, s.numero, s.fecha, s.vendedor_member_id, si.product_id, si.product_nombre, si.cantidad, si.precio_unitario_neto
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.company_id = p_company_id AND s.estado = 'confirmed'
  ORDER BY s.fecha DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ventas_por_vendedor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ventas_por_vendedor(uuid) TO authenticated;
