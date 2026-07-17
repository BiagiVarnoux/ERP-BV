-- Backfill: siembra la fila de permisos 'catalogo_ventas' para los miembros
-- no-owner existentes, con los defaults de su rol. ON CONFLICT DO NOTHING
-- para NO pisar permisos ya personalizados. Los owners quedan cubiertos por
-- el fallback del frontend (ALL_MODULES), no necesitan filas.
--
-- Por default_permissions_for_role(): 'custom' (el rol pensado para
-- vendedores) cae en el ELSE -> false para todo, así que un vendedor no ve
-- este módulo hasta que el owner se lo habilite manualmente en
-- Configuración → Miembros.
INSERT INTO public.member_permissions
  (company_member_id, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT cm.id, d.module, d.can_view, d.can_create, d.can_edit, d.can_delete, d.can_approve, d.can_export
FROM public.company_members cm
CROSS JOIN LATERAL public.default_permissions_for_role(cm.role_typed) d
WHERE d.module = 'catalogo_ventas'
  AND cm.role_typed <> 'owner'
ON CONFLICT (company_member_id, module) DO NOTHING;
