-- RPC dedicado para el modal de Ventas: devuelve los "vendedores" (miembros con
-- role_typed='custom') de la empresa, accesible a CUALQUIER miembro de la
-- empresa (no solo al owner).
--
-- Bug que corrige: el modal de Ventas obtenía los vendedores vía
-- get_company_members_detail, que está restringido a owners (y además expone
-- emails/conteos de permisos de todos los miembros). Por eso un usuario NO owner
-- —aunque tuviera permiso para crear ventas— no veía el selector de vendedor.
--
-- Este RPC expone solo lo mínimo (id + nombre + email del vendedor) y su única
-- guarda de acceso es la pertenencia a la empresa (rule 1 / S8: filtra por
-- company_id; SECURITY DEFINER, por lo que el WHERE es el único guard).
CREATE OR REPLACE FUNCTION public.get_company_vendedores(p_company_id uuid)
RETURNS TABLE(member_id uuid, display_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    cm.id                                   AS member_id,
    COALESCE(cm.display_name, cm.email, '') AS display_name,
    COALESCE(cm.email, '')                  AS email
  FROM company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.role_typed = 'custom'
    -- Guarda de acceso: quien llama debe ser miembro de esa empresa.
    AND cm.company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ORDER BY display_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_company_vendedores(uuid) TO authenticated;
