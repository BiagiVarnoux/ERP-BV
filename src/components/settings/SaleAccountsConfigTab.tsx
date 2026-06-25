// Pestaña: gestión de métodos de pago por empresa.
// - Métodos del sistema: cambiar cuenta, activar/desactivar (no se pueden eliminar)
// - Métodos personalizados: agregar, cambiar cuenta, activar/desactivar, eliminar

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import {
  loadPaymentMethods,
  savePaymentMethods,
  deleteCustomPaymentMethod,
  generateTipoPagoKey,
  DEFAULT_PAYMENT_ACCOUNTS,
  type PaymentMethod,
} from '@/domain/sales';
import type { TipoPago } from '@/domain/sales';

const CXC_TIPOS = new Set(['cxc', 'cxc_electronica', 'cxc_pedido', 'cxc_licitaciones']);

export function SaleAccountsConfigTab() {
  const companyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Formulario para agregar nuevo método
  const [addLabel, setAddLabel] = useState('');
  const [addAccount, setAddAccount] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

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

  function updateMethod(tipo_pago: string, patch: Partial<PaymentMethod>) {
    setMethods(prev => prev.map(m => m.tipo_pago === tipo_pago ? { ...m, ...patch } : m));
    setDirty(true);
  }

  function resetToDefault(tipo_pago: string) {
    const defaultCodigo = DEFAULT_PAYMENT_ACCOUNTS[tipo_pago as TipoPago];
    updateMethod(tipo_pago, { account_codigo: defaultCodigo, enabled: true });
  }

  async function handleDelete(tipo_pago: string) {
    if (!companyId) return;
    try {
      await deleteCustomPaymentMethod(companyId, tipo_pago);
      setMethods(prev => prev.filter(m => m.tipo_pago !== tipo_pago));
      toast.success('Método eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  }

  function handleAdd() {
    if (!addLabel.trim()) { toast.error('Ingresá un nombre'); return; }
    if (!addAccount) { toast.error('Seleccioná una cuenta'); return; }
    const existingKeys = methods.map(m => m.tipo_pago);
    const key = generateTipoPagoKey(addLabel, existingKeys);
    const newMethod: PaymentMethod = {
      tipo_pago:     key,
      label:         addLabel.trim(),
      account_codigo: addAccount,
      enabled:       true,
      is_custom:     true,
    };
    setMethods(prev => [...prev, newMethod]);
    setDirty(true);
    setAddLabel('');
    setAddAccount('');
    setShowAddForm(false);
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

  function isModified(m: PaymentMethod): boolean {
    if (m.is_custom) return false;
    const defaultCodigo = DEFAULT_PAYMENT_ACCOUNTS[m.tipo_pago as TipoPago];
    return m.account_codigo !== defaultCodigo || !m.enabled;
  }

  function accountName(codigo: string): string {
    return accounts.find(a => a.id === codigo)?.name ?? codigo;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>;
  }

  const systemMethods  = methods.filter(m => !m.is_custom);
  const customMethods  = methods.filter(m => m.is_custom);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Configurá qué cuenta del plan de cuentas corresponde a cada método de pago.
          Podés desactivar métodos que no usás, y agregar métodos personalizados.
        </p>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Tabla de métodos del sistema */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Métodos del sistema
        </p>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Método</TableHead>
                <TableHead className="w-20">Tipo</TableHead>
                <TableHead>Cuenta asignada</TableHead>
                <TableHead className="w-20 text-center">Activo</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systemMethods.map(m => (
                <TableRow key={m.tipo_pago} className={!m.enabled ? 'opacity-50' : ''}>
                  <TableCell className="font-medium text-sm">{m.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${CXC_TIPOS.has(m.tipo_pago) ? 'border-blue-300 text-blue-700' : 'border-slate-300 text-slate-600'}`}>
                      {CXC_TIPOS.has(m.tipo_pago) ? 'CxC' : 'Caja/Banco'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.account_codigo}
                        onValueChange={v => updateMethod(m.tipo_pago, { account_codigo: v })}
                      >
                        <SelectTrigger className="w-full max-w-xs h-8 text-sm">
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
                      {isModified(m) && (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-300 shrink-0 whitespace-nowrap">
                          Modificado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={v => updateMethod(m.tipo_pago, { enabled: v })}
                    />
                  </TableCell>
                  <TableCell>
                    {isModified(m) && (
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        title="Restaurar default"
                        onClick={() => resetToDefault(m.tipo_pago)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Métodos personalizados */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Métodos personalizados
          </p>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowAddForm(v => !v)}>
            <Plus className="h-3.5 w-3.5" /> Agregar método
          </Button>
        </div>

        {/* Formulario para agregar */}
        {showAddForm && (
          <div className="mb-3 p-3 rounded-md border bg-muted/30 flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-40">
              <Label className="text-xs mb-1 block">Nombre del método</Label>
              <Input
                className="h-8 text-sm"
                placeholder="Ej: Billetera QR, Transferencia"
                value={addLabel}
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
            <div className="flex gap-2">
              <Button size="sm" className="h-8" onClick={handleAdd}>Agregar</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowAddForm(false); setAddLabel(''); setAddAccount(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {customMethods.length === 0 && !showAddForm ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
            No hay métodos personalizados. Usá "Agregar método" para crear uno.
          </p>
        ) : customMethods.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Nombre</TableHead>
                  <TableHead>Cuenta asignada</TableHead>
                  <TableHead className="w-20 text-center">Activo</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customMethods.map(m => (
                  <TableRow key={m.tipo_pago} className={!m.enabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.tipo_pago}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={m.account_codigo}
                          onValueChange={v => updateMethod(m.tipo_pago, { account_codigo: v })}
                        >
                          <SelectTrigger className="w-full max-w-xs h-8 text-sm">
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
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          {accountName(m.account_codigo)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={m.enabled}
                        onCheckedChange={v => updateMethod(m.tipo_pago, { enabled: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Eliminar método"
                        onClick={() => handleDelete(m.tipo_pago)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Solo se muestran cuentas de tipo <strong>ACTIVO</strong> del plan de cuentas.
        Los métodos desactivados no aparecen en el modal de ventas.
      </p>
    </div>
  );
}
