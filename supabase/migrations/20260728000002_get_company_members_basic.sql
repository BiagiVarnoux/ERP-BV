-- Resolector canónico de identidad de miembros (fix estructural).
--
-- Problema de raíz: la resolución de nombres de miembros dependía de
-- get_company_members_detail, que autoriza SOLO por owner (y además expone
-- conteos de permisos, un dato de administración). Por eso cualquier feature de
-- negocio que mostrara nombres de miembros (selector de vendedor en el modal de
-- Ventas, "Ventas por Vendedor" en el Catálogo) se rompía para usuarios no-owner
-- aunque tuvieran permiso del módulo. Se venía parchando caso por caso.
--
-- Solución: separar responsabilidades y tener UN solo resolector reutilizable.
--   * get_company_members_detail  -> queda SOLO para administración de Usuarios
--     (owner). Incluye conteos de permisos.
--   * get_company_members_basic   -> identidad (id/nombre/email/rol) accesible a
--     CUALQUIER miembro de la empresa. La identidad de un colega no es dato
--     sensible intra-empresa; la única guarda es pertenecer a la misma empresa,
--     coherente con el scoping por company_id de todo el sistema. Se usa en
--     todos los lugares donde aparece un member_id (vendedores, comisiones, y
--     cualquier resolución de nombres futura).
--
-- Reemplaza al parche estrecho get_company_vendedores (ver migraciones
-- 20260728000000 / 20260728000001), que aquí se elimina.
CREATE OR REPLACE FUNCTION public.get_company_members_basic(p_company_id uuid)
RETURNS TABLE(member_id uuid, user_id uuid, display_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    cm.id AS member_id,
    cm.user_id,
    COALESCE(NULLIF(cm.display_name, ''), NULLIF(cm.email, ''), au.email, '') AS display_name,
    COALESCE(NULLIF(cm.email, ''), au.email, '') AS email,
    cm.role_typed::text AS role
  FROM public.company_members cm
  LEFT JOIN auth.users au ON au.id = cm.user_id
  WHERE cm.company_id = p_company_id
    -- Guarda de acceso: quien llama debe ser miembro de esa empresa.
    AND cm.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  ORDER BY display_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_company_members_basic(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_company_vendedores(uuid);
