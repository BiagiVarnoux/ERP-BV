import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MemberDetail {
  member_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  modules_total: number;
  modules_with_view: number;
  joined_at: string;
}

interface ModuleRow {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  accounts:          'Plan de Cuentas',
  journal:           'Libro Diario',
  ledger:            'Libro Mayor',
  auxiliary_ledgers: 'Libros Auxiliares',
  reports:           'Reportes',
  fiscal_years:      'Gestiones (Años Fiscales)',
  inventory:         'Inventario',
  sales:             'Ventas',
  customers:         'Clientes',
  receivables:       'Cuentas x Cobrar',
  payables:          'Cuentas x Pagar',
  shipments:         'Embarques / Importación',
  licitaciones:      'Licitaciones',
  investments:       'Análisis de Inversión',
  settings:          'Configuración',
  holding:           'Holding (Consolidado)',
};

const ROLE_LABELS: Record<string, string> = {
  owner:      'Propietario',
  manager:    'Gerente',
  accountant: 'Contador',
  auditor:    'Auditor',
  viewer:     'Lector',
  custom:     'Personalizado',
};

const ROLE_COLORS: Record<string, string> = {
  owner:      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  manager:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accountant: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  auditor:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  viewer:     'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  custom:     'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const ACTIONS: { key: keyof Omit<ModuleRow, 'module'>; label: string }[] = [
  { key: 'can_view',    label: 'Ver'      },
  { key: 'can_create',  label: 'Crear'    },
  { key: 'can_edit',    label: 'Editar'   },
  { key: 'can_delete',  label: 'Eliminar' },
  { key: 'can_approve', label: 'Aprobar'  },
  { key: 'can_export',  label: 'Exportar' },
];

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  member: MemberDetail | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserPermissionsModal({ member, open, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<ModuleRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('viewer');
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member && open) {
      setSelectedRole(member.role);
      loadPermissions(member.member_id);
    }
  }, [member, open]);

  const loadPermissions = async (memberId: string) => {
    setLoadingPerms(true);
    try {
      const { data, error } = await supabase.rpc('get_member_permissions', {
        p_member_id: memberId,
      });
      if (error) throw error;
      setPermissions(data || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingPerms(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!member || newRole === member.role) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_member_role', {
        p_member_id: member.member_id,
        p_new_role: newRole,
      });
      if (error) throw error;
      setSelectedRole(newRole);
      await loadPermissions(member.member_id);
      toast({ title: 'Rol actualizado', description: `Rol cambiado a ${ROLE_LABELS[newRole]}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionChange = (
    module: string,
    action: keyof Omit<ModuleRow, 'module'>,
    value: boolean,
  ) => {
    setPermissions(prev =>
      prev.map(p => {
        if (p.module !== module) return p;
        const updated = { ...p, [action]: value };
        // Si se desmarca "ver", limpiar todas las acciones
        if (action === 'can_view' && !value) {
          return { ...updated, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: false };
        }
        // Si se marca cualquier acción, auto-marcar "ver"
        if (action !== 'can_view' && value) {
          return { ...updated, can_view: true };
        }
        return updated;
      }),
    );
    // Cambiar a "custom" si se modifica manualmente
    if (selectedRole !== 'custom' && selectedRole !== 'owner') {
      setSelectedRole('custom');
    }
  };

  const savePermissions = async () => {
    if (!member) return;
    setSaving(true);
    try {
      // Actualizar rol si cambió a custom
      if (selectedRole !== member.role) {
        const { error } = await supabase.rpc('update_member_role', {
          p_member_id: member.member_id,
          p_new_role: selectedRole,
        });
        if (error) throw error;
      }

      // Guardar cada módulo
      for (const p of permissions) {
        const { error } = await supabase.rpc('update_member_module_permission', {
          p_member_id:   member.member_id,
          p_module:      p.module,
          p_can_view:    p.can_view,
          p_can_create:  p.can_create,
          p_can_edit:    p.can_edit,
          p_can_delete:  p.can_delete,
          p_can_approve: p.can_approve,
          p_can_export:  p.can_export,
        });
        if (error) throw error;
      }

      toast({ title: 'Permisos guardados', description: 'Los cambios fueron aplicados correctamente.' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Permisos de {member.display_name || member.email}
          </DialogTitle>
        </DialogHeader>

        {/* Selector de rol */}
        <div className="flex items-center gap-4 py-2 border-b">
          <span className="text-sm font-medium text-muted-foreground w-16">Rol</span>
          <Select value={selectedRole} onValueChange={handleRoleChange} disabled={member.role === 'owner' || saving}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'owner').map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge className={ROLE_COLORS[selectedRole] ?? ''}>
            {ROLE_LABELS[selectedRole] ?? selectedRole}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            Al cambiar el rol se restablecen los permisos por defecto
          </span>
        </div>

        {/* Tabla de permisos */}
        {loadingPerms ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium w-48">Módulo</th>
                  {ACTIONS.map(a => (
                    <th key={a.key} className="text-center py-2 px-2 font-medium text-muted-foreground w-20">
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map(p => (
                  <tr key={p.module} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">
                      {MODULE_LABELS[p.module] ?? p.module}
                    </td>
                    {ACTIONS.map(a => (
                      <td key={a.key} className="text-center py-2 px-2">
                        <Checkbox
                          checked={p[a.key]}
                          onCheckedChange={v => handlePermissionChange(p.module, a.key, !!v)}
                          disabled={member.role === 'owner' || saving}
                          className="mx-auto"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={savePermissions} disabled={saving || loadingPerms || member.role === 'owner'}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar permisos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
