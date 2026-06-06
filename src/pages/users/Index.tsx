import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserPlus, ShieldCheck, UserMinus, Loader2, Users } from 'lucide-react';
import { UserPermissionsModal, type MemberDetail } from '@/components/users/UserPermissionsModal';
import { InviteUserModal } from '@/components/users/InviteUserModal';

// ─── Helpers visuales ─────────────────────────────────────────────────────────

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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function UsersPage() {
  const { companyId, isOwner } = useUserAccess();
  const { toast } = useToast();

  const [members, setMembers]           = useState<MemberDetail[]>([]);
  const [loading, setLoading]           = useState(true);
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [permsOpen, setPermsOpen]       = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberDetail | null>(null);
  const [removing, setRemoving]         = useState(false);

  const loadMembers = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_company_members_detail', {
        p_company_id: companyId,
      });
      if (error) throw error;
      setMembers((data as MemberDetail[]) || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const openPermissions = (member: MemberDetail) => {
    setSelectedMember(member);
    setPermsOpen(true);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { error } = await supabase.rpc('remove_company_member', {
        p_member_id: removeTarget.member_id,
      });
      if (error) throw error;
      toast({ title: 'Usuario eliminado', description: `${removeTarget.display_name || removeTarget.email} fue removido.` });
      loadMembers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Solo el propietario puede gestionar usuarios.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground">Gestiona los miembros y sus permisos en la empresa</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invitar usuario
        </Button>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total miembros</CardDescription>
            <CardTitle className="text-3xl">{members.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Con acceso activo</CardDescription>
            <CardTitle className="text-3xl">
              {members.filter(m => m.modules_with_view > 0).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Solo lectura</CardDescription>
            <CardTitle className="text-3xl">
              {members.filter(m => m.role === 'viewer' || m.role === 'auditor').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabla de miembros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Miembros de la empresa
          </CardTitle>
          <CardDescription>Haz clic en un usuario para editar sus permisos por módulo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No hay miembros registrados aún.</p>
              <p className="text-sm">Invita a un usuario para comenzar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-center">Módulos con acceso</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(member => (
                  <TableRow
                    key={member.member_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openPermissions(member)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{member.display_name || member.email || '—'}</p>
                        {member.display_name && member.email && (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${ROLE_COLORS[member.role] ?? ''}`}>
                        {ROLE_LABELS[member.role] ?? member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm">
                        {member.modules_with_view}
                        <span className="text-muted-foreground"> / {member.modules_total}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(member.joined_at).toLocaleDateString('es-BO')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar permisos"
                          onClick={() => openPermissions(member)}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        {member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Eliminar usuario"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(member)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modales */}
      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => loadMembers()}
      />

      <UserPermissionsModal
        member={selectedMember}
        open={permsOpen}
        onClose={() => { setPermsOpen(false); setSelectedMember(null); }}
        onSaved={loadMembers}
      />

      {/* Confirmar eliminación */}
      <AlertDialog open={!!removeTarget} onOpenChange={v => !v && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará a <strong>{removeTarget?.display_name || removeTarget?.email}</strong> de la empresa.
              Perderá todo acceso inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
