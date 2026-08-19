// Gestión de canales de venta por empresa: renombrar, agregar, desactivar o
// eliminar canales y elegir sus cuentas de Ingreso, Costo de Ventas y su CxC.
// La primera vez se precargan los 4 canales típicos como punto de partida.

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
  loadChannels,
  saveChannels,
  deleteChannel,
  generateChannelKey,
  loadPaymentMethods,
  type SaleChannel,
  type PaymentMethod,
} from '@/domain/sales';

export function SaleChannelsConfigTab() {
  const companyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const [channels, setChannels] = useState<SaleChannel[]>([]);
  const [methods, setMethods]   = useState<PaymentMethod[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft]     = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addLabel, setAddLabel]     = useState('');
  const [addRevenue, setAddRevenue] = useState('');
  const [addCogs, setAddCogs]       = useState('');
  const [addCxc, setAddCxc]         = useState<string>('__none__');

  const ingresoAccounts = accounts
    .filter(a => a.type === 'INGRESO')
    .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  const gastoAccounts = accounts
    .filter(a => a.type === 'GASTO')
    .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  const cxcMethods = methods.filter(m => m.tipo_pago.startsWith('cxc'));

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    Promise.all([loadChannels(companyId), loadPaymentMethods(companyId)])
      .then(([ch, m]) => { setChannels(ch); setMethods(m); setDirty(false); })
      .catch(() => toast.error('Error cargando canales'))
      .finally(() => setLoading(false));
  }, [companyId]);

  function update(canal_key: string, patch: Partial<SaleChannel>) {
    setChannels(prev => prev.map(c => c.canal_key === canal_key ? { ...c, ...patch } : c));
    setDirty(true);
  }

  function startEditLabel(c: SaleChannel) {
    setEditingLabel(c.canal_key);
    setLabelDraft(c.label);
  }
  function confirmEditLabel(canal_key: string) {
    if (labelDraft.trim()) update(canal_key, { label: labelDraft.trim() });
    setEditingLabel(null);
  }

  async function handleDelete(canal_key: string) {
    if (!companyId) return;
    try {
      await deleteChannel(companyId, canal_key);
      setChannels(prev => prev.filter(c => c.canal_key !== canal_key));
      toast.success('Canal eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  }

  function handleAdd() {
    if (!addLabel.trim()) { toast.error('Ingresá un nombre'); return; }
    if (!addRevenue)      { toast.error('Seleccioná la cuenta de Ingreso'); return; }
    if (!addCogs)         { toast.error('Seleccioná la cuenta de Costo de Ventas'); return; }
    const key = generateChannelKey(addLabel, channels.map(c => c.canal_key));
    setChannels(prev => [...prev, {
      canal_key: key,
      label: addLabel.trim(),
      revenue_account: addRevenue,
      cogs_account: addCogs,
      cxc_tipo_pago: addCxc === '__none__' ? null : addCxc,
      enabled: true,
      sort_order: prev.length,
    }]);
    setDirty(true);
    setAddLabel(''); setAddRevenue(''); setAddCogs(''); setAddCxc('__none__'); setShowAdd(false);
  }

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    try {
      await saveChannels(companyId, channels);
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
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Canales de venta de tu empresa. Cada canal define a qué cuenta de
          <strong> Ingreso</strong>, <strong>Costo de Ventas</strong> y <strong>CxC</strong> se
          asientan sus ventas. Podés renombrar, agregar, desactivar o eliminar cualquiera.
        </p>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Canal</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Costo de Ventas</TableHead>
              <TableHead>CxC</TableHead>
              <TableHead className="w-20 text-center">Activo</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map(c => (
              <TableRow key={c.canal_key} className={!c.enabled ? 'opacity-50' : ''}>
                {/* Nombre editable */}
                <TableCell>
                  {editingLabel === c.canal_key ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-sm"
                        value={labelDraft}
                        autoFocus
                        onChange={e => setLabelDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmEditLabel(c.canal_key);
                          if (e.key === 'Escape') setEditingLabel(null);
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => confirmEditLabel(c.canal_key)}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => setEditingLabel(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group">
                      <span className="font-medium text-sm">{c.label}</span>
                      <Button variant="ghost" size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => startEditLabel(c)}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </TableCell>

                {/* Ingreso */}
                <TableCell>
                  <Select value={c.revenue_account} onValueChange={v => update(c.canal_key, { revenue_account: v })}>
                    <SelectTrigger className="h-8 text-sm max-w-[13rem]"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {ingresoAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>{a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* COGS */}
                <TableCell>
                  <Select value={c.cogs_account} onValueChange={v => update(c.canal_key, { cogs_account: v })}>
                    <SelectTrigger className="h-8 text-sm max-w-[13rem]"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {gastoAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>{a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* CxC */}
                <TableCell>
                  <Select
                    value={c.cxc_tipo_pago ?? '__none__'}
                    onValueChange={v => update(c.canal_key, { cxc_tipo_pago: v === '__none__' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-sm max-w-[12rem]"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="__none__"><span className="text-muted-foreground">— Ninguna —</span></SelectItem>
                      {cxcMethods.map(m => (
                        <SelectItem key={m.tipo_pago} value={m.tipo_pago}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Activo */}
                <TableCell className="text-center">
                  <Switch checked={c.enabled} onCheckedChange={v => update(c.canal_key, { enabled: v })} />
                </TableCell>

                {/* Eliminar */}
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(c.canal_key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {channels.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No hay canales. Usá "Agregar canal" para crear uno.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Formulario agregar */}
      {showAdd ? (
        <div className="p-3 rounded-md border bg-muted/30 flex items-end gap-3 flex-wrap">
          <div className="min-w-36">
            <Label className="text-xs mb-1 block">Nombre del canal</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Ej: Exportación, Mostrador…"
              value={addLabel}
              autoFocus
              onChange={e => setAddLabel(e.target.value)}
            />
          </div>
          <div className="min-w-44">
            <Label className="text-xs mb-1 block">Ingreso</Label>
            <Select value={addRevenue} onValueChange={setAddRevenue}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Cuenta de ingreso…" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {ingresoAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>{a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44">
            <Label className="text-xs mb-1 block">Costo de Ventas</Label>
            <Select value={addCogs} onValueChange={setAddCogs}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Cuenta de costo…" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {gastoAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{a.id}</span>{a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <Label className="text-xs mb-1 block">CxC (opcional)</Label>
            <Select value={addCxc} onValueChange={setAddCxc}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="__none__"><span className="text-muted-foreground">— Ninguna —</span></SelectItem>
                {cxcMethods.map(m => (
                  <SelectItem key={m.tipo_pago} value={m.tipo_pago}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" className="h-8" onClick={handleAdd}>Agregar</Button>
            <Button size="sm" variant="outline" className="h-8"
              onClick={() => { setShowAdd(false); setAddLabel(''); setAddRevenue(''); setAddCogs(''); setAddCxc('__none__'); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Agregar canal
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Ingreso = cuentas tipo <strong>INGRESO</strong>; Costo de Ventas = cuentas tipo <strong>GASTO</strong>.
        Los canales desactivados no aparecen en el modal de ventas. Renombrar un canal no
        cambia las ventas ya registradas.
      </p>
    </div>
  );
}
