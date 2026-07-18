-- Cierra la fuga de costo/margen a través de sales/sale_items/products.
--
-- Problema: sus políticas RLS eran del patrón company_member_all — permiten
-- leer la fila completa a CUALQUIER miembro de la empresa, sin mirar el
-- permiso granular por módulo (member_permissions/can()). Ese permiso solo
-- se aplicaba en la UI. Un vendedor (rol 'custom', pensado para gente
-- externa) podía en teoría llamar directo a la API REST y leer
-- sale_items.costo_unitario/margen_bruto o products.costo_con_iva_bs —
-- justo lo que el módulo Catálogo de Ventas fue diseñado para ocultarle.
--
-- RLS es por fila, no por columna: un vendedor necesita leer ALGUNAS
-- columnas de `products` (precio, fotos) pero no otras (costo). Por eso,
-- antes de endurecer el RLS de `products`, hay que mover las dos vistas del
-- Catálogo que tocaban las tablas directo a funciones SECURITY DEFINER que
-- seleccionan explícitamente solo columnas seguras (mismo patrón ya usado
-- en get_catalog_stock/get_my_ventas).

-- ─── 1. get_catalog_productos: reemplaza el select directo de VendorCatalogView.tsx ───

CREATE OR REPLACE FUNCTION public.get_catalog_productos(p_company_id uuid)
RETURNS TABLE(
  id uuid, nombre text, especificacion text, condicion text,
  descripcion_catalogo text, precio_lista numeric,
  precio_minimo_negociacion numeric, comision_bs numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id, p.nombre, p.especificacion, p.condicion,
         p.descripcion_catalogo, p.precio_lista,
         p.precio_minimo_negociacion, p.comision_bs
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

-- ─── 2. get_ventas_por_vendedor: reemplaza el select directo de VentasPorVendedorView.tsx ───
-- SECURITY DEFINER bypasea RLS por completo, así que el chequeo de permiso
-- va DENTRO de la función (mismo permiso que ya gatea esta pestaña en la UI:
-- can('catalogo_ventas', 'edit')).

CREATE OR REPLACE FUNCTION public.get_ventas_por_vendedor(p_company_id uuid)
RETURNS TABLE(
  sale_id uuid, numero text, fecha date, vendedor_member_id uuid,
  product_id uuid, product_nombre text, cantidad numeric
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
  SELECT s.id, s.numero, s.fecha, s.vendedor_member_id, si.product_id, si.product_nombre, si.cantidad
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.company_id = p_company_id AND s.estado = 'confirmed'
  ORDER BY s.fecha DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ventas_por_vendedor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ventas_por_vendedor(uuid) TO authenticated;

-- ─── 3. Endurecer get_catalog_costo_referencia (ya desplegada) ────────────────
-- Hoy solo exige membresía de empresa; le agrega el mismo permiso que
-- get_ventas_por_vendedor, porque también devuelve costo/IVA reconstruido.

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
      AND (
        cm.role_typed = 'owner'
        OR EXISTS (
          SELECT 1 FROM public.member_permissions mp
          WHERE mp.company_member_id = cm.id AND mp.module = 'catalogo_ventas' AND mp.can_edit = true
        )
      )
  )
  GROUP BY product_id
  HAVING SUM(peso) > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_costo_referencia(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_costo_referencia(uuid) TO authenticated;

-- ─── 4. Endurecer RLS SELECT de products/sales/sale_items ─────────────────────
-- Las 3 tablas ya tienen políticas separadas por comando — solo se reemplaza
-- la de SELECT; INSERT/UPDATE/DELETE quedan intactas (fuera de alcance, ver
-- comentario en la migración/plan).

DROP POLICY IF EXISTS "company_member_select" ON public.products;
CREATE POLICY "company_member_select" ON public.products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid()
        AND (
          cm.role_typed = 'owner'
          OR EXISTS (
            SELECT 1 FROM public.member_permissions mp
            WHERE mp.company_member_id = cm.id
              AND mp.can_view = true
              AND mp.module IN ('inventory', 'shipments', 'journal', 'sales')
          )
          OR EXISTS (
            SELECT 1 FROM public.member_permissions mp
            WHERE mp.company_member_id = cm.id
              AND mp.module = 'catalogo_ventas' AND mp.can_edit = true
          )
        )
    )
  );

DROP POLICY IF EXISTS "company_member_select" ON public.sales;
CREATE POLICY "company_member_select" ON public.sales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = sales.company_id AND cm.user_id = auth.uid()
        AND (
          cm.role_typed = 'owner'
          OR EXISTS (
            SELECT 1 FROM public.member_permissions mp
            WHERE mp.company_member_id = cm.id AND mp.module = 'sales' AND mp.can_view = true
          )
        )
    )
  );

DROP POLICY IF EXISTS "company_member_select" ON public.sale_items;
CREATE POLICY "company_member_select" ON public.sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.id = sale_items.sale_id AND cm.user_id = auth.uid()
        AND (
          cm.role_typed = 'owner'
          OR EXISTS (
            SELECT 1 FROM public.member_permissions mp
            WHERE mp.company_member_id = cm.id AND mp.module = 'sales' AND mp.can_view = true
          )
        )
    )
  );
