-- Catálogo de Ventas: (1) mostrar si el precio de lista subió/bajó respecto
-- al anterior, y (2) exponer el precio con factura en la lista del vendedor.
--
-- (1) Historial de precio: un trigger BEFORE UPDATE guarda el precio anterior
-- y la fecha del cambio automáticamente cada vez que precio_lista cambia
-- (por cualquier vía). No dispara nada cuando otras columnas cambian.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS precio_lista_anterior numeric(18,2),
  ADD COLUMN IF NOT EXISTS precio_actualizado_at timestamptz;

CREATE OR REPLACE FUNCTION public.track_precio_lista_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.precio_lista IS DISTINCT FROM OLD.precio_lista THEN
    NEW.precio_lista_anterior := OLD.precio_lista;
    NEW.precio_actualizado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_precio_lista ON public.products;
CREATE TRIGGER trg_track_precio_lista
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.track_precio_lista_change();

-- (2) get_catalog_productos: agrega precio_con_factura (calculado del lado del
-- servidor para no exponer el IVA/costo al vendedor) + los campos del
-- historial de precio. Fórmula: (precio_lista - IVA_importado) / 0.84.
-- DROP + CREATE porque cambia el tipo de retorno (RETURNS TABLE).
DROP FUNCTION IF EXISTS public.get_catalog_productos(uuid);
CREATE FUNCTION public.get_catalog_productos(p_company_id uuid)
RETURNS TABLE(
  id uuid, nombre text, especificacion text, condicion text,
  descripcion_catalogo text, precio_lista numeric,
  precio_minimo_negociacion numeric, comision_bs numeric,
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
