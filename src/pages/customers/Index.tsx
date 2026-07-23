import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Users, Pencil, UserMinus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt } from '@/accounting/utils';
import { supabase } from '@/integrations/supabase/client';
import { updateCustomer } from '@/domain/customers';
import type { CustomerRow } from '@/domain/customers';
import { CustomerModal } from '@/components/customers/CustomerModal';

const TIPO_LABELS: Record<string, string> = {
  empresa: 'Empresa',
  natural: 'Persona natural',
};

export default function CustomersPage() {
  const { can } = useUserAccess();
  const canCreate = can('customers', 'create');
  const canEdit   = can('customers', 'edit');
  const canDelete = can('customers', 'delete');
  const activeCompanyId = useActiveCompanyId();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerRow | null>(null);

  // Deactivation 2-step
  const [deactivateTarget, setDeactivateTarget] = useState<CustomerRow | null>(null);
  const [deactivateStep, setDeactivateStep] = useState<1 | 2>(1);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('razon_social');
      if (error) throw new Error(error.message);
      setCustomers((data ?? []) as CustomerRow[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      if (!showInactive && !c.activo) return false;
      if (!q) return true;
      return (
        c.razon_social.toLowerCase().includes(q) ||
        (c.nit ?? '').toLowerCase().includes(q) ||
        (c.codigo ?? '').toLowerCase().includes(q)
      );
    });
  }, [customers, search, showInactive]);

  function openNew() {
    setEditCustomer(null);
    setShowModal(true);
  }

  function openEdit(c: CustomerRow) {
    setEditCustomer(c);
    setShowModal(true);
  }

  function handleSaved(saved: CustomerRow) {
    setCustomers(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) => a.razon_social.localeCompare(b.razon_social));
    });
  }

  function startDeactivate(c: CustomerRow) {
    setDeactivateTarget(c);
    setDeactivateStep(1);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const updated = await updateCustomer(deactivateTarget.id, { activo: false });
      toast.success(`Cliente "${deactivateTarget.razon_social}" desactivado`);
      setDeactivateTarget(null);
      setDeactivateStep(1);
      handleSaved(updated);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al desactivar');
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold flex items-center gap-2">
          <Users className="w-6 h-6" /> Clientes
        </h1>
        {canCreate && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Cliente
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar por razón social, NIT o código..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando clientes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mb-4 opacity-40" />
          <p>No hay clientes{search ? ' que coincidan con la búsqueda' : ''}.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Razón Social</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Crédito autorizado</TableHead>
                {(canEdit || canDelete) && <TableHead className="text-center">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id} className={!c.activo ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-xs">{c.codigo ?? '—'}</TableCell>
                  <TableCell className="font-medium">
                    {c.razon_social}
                    {!c.activo && (
                      <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{TIPO_LABELS[c.tipo] ?? c.tipo}</TableCell>
                  <TableCell className="text-sm font-mono">{c.nit ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.ciudad ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.telefono ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm">
                    {c.credito_autorizado > 0 ? `Bs ${fmt(c.credito_autorizado)}` : '—'}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(c)}
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {c.activo && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => startDeactivate(c)}
                            title="Desactivar"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        editCustomer={editCustomer}
      />

      {/* Deactivate step 1 */}
      <AlertDialog
        open={!!deactivateTarget && deactivateStep === 1}
        onOpenChange={o => { if (!o) { setDeactivateTarget(null); setDeactivateStep(1); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              El cliente "{deactivateTarget?.razon_social}" quedará inactivo y no aparecerá en los selectores de nueva venta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); setDeactivateStep(2); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate step 2 */}
      <AlertDialog
        open={!!deactivateTarget && deactivateStep === 2}
        onOpenChange={o => { if (!o) { setDeactivateTarget(null); setDeactivateStep(1); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará al cliente "{deactivateTarget?.razon_social}". Podrás reactivarlo editándolo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeactivateTarget(null); setDeactivateStep(1); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              disabled={deactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivating ? 'Desactivando...' : 'Confirmar desactivación'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
