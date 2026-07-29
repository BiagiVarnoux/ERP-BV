-- Fix del selector de vendedor en el modal de Ventas.
--
-- Los vendedores (company_members con role_typed='custom') normalmente tienen
-- display_name y email nulos en company_members; su email vive en auth.users.
-- La primera versión de get_company_vendedores no usaba ese respaldo, así que
-- devolvía las filas con nombre vacío y el selector se veía en blanco (parecía
-- "no hay vendedores").
--
-- Se agrega el LEFT JOIN a auth.users y el fallback a au.email —igual que el RPC
-- original get_company_members_detail— para que el nombre nunca quede vacío.
CREATE OR REPLACE FUNCTION public.get_company_vendedores(p_company_id uuid)
RETURNS TABLE(member_id uuid, display_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    cm.id AS member_id,
    COALESCE(NULLIF(cm.display_name, ''), NULLIF(cm.email, ''), au.email, '') AS display_name,
    COALESCE(NULLIF(cm.email, ''), au.email, '') AS email
  FROM company_members cm
  LEFT JOIN auth.users au ON au.id = cm.user_id
  WHERE cm.company_id = p_company_id
    AND cm.role_typed = 'custom'
    -- Guarda de acceso: quien llama debe ser miembro de esa empresa.
    AND cm.company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ORDER BY display_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_company_vendedores(uuid) TO authenticated;
