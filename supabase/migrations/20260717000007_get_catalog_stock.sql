-- Stock disponible por producto, respetando el método de valuación de cada
-- uno (FIFO usa inventory_lots.cantidad_disponible; CPP usa el neto de
-- inventory_movements ENTRADA/SALIDA — mismo cálculo que ya usa create_sale()
-- para validar stock al vender). Se usa para ocultar automáticamente del
-- Catálogo de Ventas los productos agotados, sin depender de que el owner
-- los desmarque a mano.
CREATE OR REPLACE FUNCTION public.get_catalog_stock(p_company_id uuid)
RETURNS TABLE(product_id uuid, stock_disponible numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p.id,
    CASE
      WHEN p.metodo_valuacion = 'FIFO' THEN COALESCE((
        SELECT SUM(l.cantidad_disponible) FROM public.inventory_lots l
        WHERE l.product_id = p.id AND l.company_id = p_company_id
      ), 0)
      ELSE COALESCE((
        SELECT SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.cantidad WHEN m.tipo = 'SALIDA' THEN -m.cantidad ELSE 0 END)
        FROM public.inventory_movements m
        WHERE m.product_id = p.id AND m.company_id = p_company_id
      ), 0)
    END AS stock_disponible
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p_company_id AND cm.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_stock(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_stock(uuid) TO authenticated;
