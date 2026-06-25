// Gestión de métodos de pago: todos iguales, sin distinción sistema/personalizado.
// La primera vez se precargan 12 métodos típicos como punto de partida.

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import {
  loadPaymentMethods,
  savePaymentMethods,
  deletePaymentMethod,
  generateTipoPagoKey,
  type PaymentMethod,
} from '@/domain/sales';

export function SaleAccountsConfigTab() {
  const companyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const [methods, setMethods]     = useState<PaymentMethod[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft]     = useState('');

  // Formulario nuevo método
  const [showAdd, setShowAdd]   = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addAccount, setAddAccount] = useState('');

  const activoAccounts = accounts
    .filter(a => a.type === 'ACTIVO')
    .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadPaymentMethods(companyId)
      .then(m => { setMethods(m); setDirty(false); })
      .catch(() => toast.error('Error cargando métodos de pago'))
      .finally(() => setLoading(false));
  }, [companyId]);

  function update(tipo_pago: string, patch: Partial<PaymentMethod>) {
    setMethods(prev => prev.map(m => m.tipo_pago === tipo_pago ? { ...m, ...patch } : m));
    setDirty(true);
  }

  function startEditLabel(m: PaymentMethod) {
    setEditingLabel(m.tipo_pago);
    setLabelDraft(m.label);
  }

  function confirmEditLabel(tipo_pago: string) {
    if (labelDraft.trim()) update(tipo_pago, { label: labelDraft.trim() });
    setEditingLabel(null);
  }

  async function handleDelete(tipo_pago: string) {
    if (!companyId) return;
    try {
      await deletePaymentMethod(companyId, tipo_pago);
      setMethods(prev => prev.filter(m => m.tipo_pago !== tipo_pago));
      toast.success('Método eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  }

  function handleAdd() {
    if (!addLabel.trim()) { toast.error('Ingresá un nombre'); return; }
    if (!addAccount)      { toast.error('Seleccioná una cuenta'); return; }
    const key = generateTipoPagoKey(addLabel, methods.map(m => m.tipo_pago));
    setMethods(prev => [...prev, {
      tipo_pago:     key,
      label:         addLabel.trim(),
      account_codigo: addAccount,
      enabled:       true,
    }]);
    setDirty(true);
    setAddLabel(''); setAddAccount(''); setShowAdd(false);
  }

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    try {
      await savePaymentMethods(companyId, methods);
      setDirty(false);
      toast.success('Cambios guardados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Todos los métodos de pago de tu empresa. Podés editar el nombre, cambiar
          la cuenta contable, activar/desactivar o eliminar cualquiera.
          Al abrir por primera vez se precargaron los métodos típicos como punto de partida.
        </p>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Tabla unificada */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Nombre</TableHead>
              <TableHead>Cuenta contable</TableHead>
              <TableHead className="w-24 text-center">Activo</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map(m => (
              <TableRow key={m.tipo_pago} className={!m.enabled ? 'opacity-50' : ''}>

                {/* Nombre (editable inline) */}
                <TableCell>
                  {editingLabel === m.tipo_pago ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-sm"
                        value={labelDraft}
                        autoFocus
                        onChange={e => setLabelDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmEditLabel(m.tipo_pago);
                          if (e.key === 'Escape') setEditingLabel(null);
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => confirmEditLabel(m.tipo_pago)}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => setEditingLabel(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group">
                      <span className="font-medium text-sm">{m.label}</span>
                      <Button variant="ghost" size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => startEditLabel(m)}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </TableCell>

                {/* Cuenta contable */}
                <TableCell>
                  <Select
                    value={m.account_codigo}
                    onValueChange={v => update(m.tipo_pago, { account_codigo: v })}
                  >
                    <SelectTrigger className="h-8 text-sm max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {activoAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Activo */}
                <TableCell className="text-center">
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={v => update(m.tipo_pago, { enabled: v })}
                  />
                </TableCell>

                {/* Eliminar */}
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(m.tipo_pago)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {methods.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                  No hay métodos de pago. Usá "Agregar método" para crear uno.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Formulario agregar */}
      {showAdd ? (
        <div className="p-3 rounded-md border bg-muted/30 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <Label className="text-xs mb-1 block">Nombre del método</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Ej: Billetera QR, QR Transferencia…"
              value={addLabel}
              autoFocus
              onChange={e => setAddLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="flex-1 min-w-48">
            <Label className="text-xs mb-1 block">Cuenta contable</Label>
            <Select value={addAccount} onValueChange={setAddAccount}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {activoAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" className="h-8" onClick={handleAdd}>Agregar</Button>
            <Button size="sm" variant="outline" className="h-8"
              onClick={() => { setShowAdd(false); setAddLabel(''); setAddAccount(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Agregar método
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Solo se muestran cuentas de tipo <strong>ACTIVO</strong>.
        Los métodos desactivados no aparecen en el modal de ventas.
      </p>
    </div>
  );
}
