// src/components/journal/CxpCxcModal.tsx
// Cuando un asiento del Libro Diario toca una cuenta marcada como Cuenta por
// Pagar/Cobrar (Account.modulo_vinculado), este modal aparece DESPUÉS de que
// el asiento ya se guardó (por eso recibe journalEntry con id confirmado) y
// ofrece, por cada línea detectada:
//   · si la línea INCREMENTA la cuenta → crear una CxP/CxC nueva.
//   · si la línea REDUCE la cuenta     → repartir el monto entre CxP/CxC
//     abiertas de esa misma cuenta (registra el/los pago(s)).
// Reutiliza las funciones "attach_*" (capa núcleo, sin crear asiento) — el
// asiento ya existe, solo se vincula el registro de CxP/CxC a él.
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { JournalEntry } from '@/accounting/types';
import { fmt, round2 } from '@/accounting/utils';
import { listCustomers, createCustomer } from '@/domain/customers';
import type { CustomerRow } from '@/domain/customers';
import { Plus } from 'lucide-react';

export interface CxpCxcLineToProcess {
  lineIndex: number;
  accountId: string;
  accountName: string;
  lineAmount: number;
  isIncrease: boolean;
  modulo: 'cxp' | 'cxc';
}

interface OpenDoc {
  id: string;
  numero_documento: string;
  nombre: string;
  monto_pendiente: number;
  moneda: string;
}

interface Props {
  isOpen: boolean;
  linesToProcess: CxpCxcLineToProcess[];
  journalEntry: JournalEntry;
  companyId: string;
  onDone: () => void;
}

export function CxpCxcModal({ isOpen, linesToProcess, journalEntry, companyId, onDone }: Props) {
  const [lineIdx, setLineIdx] = useState(0);
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [saving, setSaving] = useState(false);

  // "Nueva CxP/CxC"
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [proveedorNit, setProveedorNit] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [moneda, setMoneda] = useState('BOB');

  // "Pago de existente" — docId -> monto (string, input controlado)
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Crear cliente nuevo inline (una CxC no siempre viene de un cliente ya
  // registrado en Ventas)
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerNombre, setNewCustomerNombre] = useState('');
  const [newCustomerNit, setNewCustomerNit] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const line = linesToProcess[lineIdx];

  useEffect(() => {
    if (isOpen && customers.length === 0) {
      listCustomers().then(setCustomers).catch(() => setCustomers([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !line) return;
    setProveedorNombre(''); setProveedorNit(''); setCustomerId('');
    setNumeroDocumento(''); setFechaVencimiento(''); setMoneda('BOB');
    setAllocations({});
    setOpenDocs([]);
    setCreatingCustomer(false); setNewCustomerNombre(''); setNewCustomerNit('');

    if (!line.isIncrease) {
      setLoadingDocs(true);
      const table = line.modulo === 'cxp' ? 'payables' : 'receivables';
      const cuentaCol = line.modulo === 'cxp' ? 'cuenta_pasivo_id' : 'cuenta_activo_id';
      const selectCols = line.modulo === 'cxp'
        ? 'id, numero_documento, proveedor_nombre, monto_pendiente, moneda'
        : 'id, numero_documento, monto_pendiente, moneda, customers ( razon_social )';
      supabase
        .from(table)
        .select(selectCols)
        .eq('company_id', companyId)
        .eq(cuentaCol, line.accountId)
        .in('estado', ['open', 'partial'])
        .order('fecha_emision')
        .then(({ data, error }) => {
          if (error) {
            toast.error('Error cargando documentos abiertos');
            setOpenDocs([]);
          } else {
            const docs = ((data ?? []) as unknown as Record<string, unknown>[]).map(r => ({
              id: r.id as string,
              numero_documento: r.numero_documento as string,
              nombre: line.modulo === 'cxp'
                ? (r.proveedor_nombre as string)
                : ((r.customers as { razon_social?: string } | null)?.razon_social ?? 'Sin cliente asociado'),
              monto_pendiente: Number(r.monto_pendiente),
              moneda: r.moneda as string,
            }));
            setOpenDocs(docs);
            // Si hay un solo documento abierto, precargar el monto sugerido
            // (evita que el usuario tenga que adivinar que debe escribir en el campo).
            if (docs.length === 1) {
              setAllocations({ [docs[0].id]: String(round2(Math.min(line.lineAmount, docs[0].monto_pendiente))) });
            }
          }
          setLoadingDocs(false);
        });
    }
  }, [isOpen, lineIdx, line, companyId]);

  if (!line) return null;

  function advance() {
    if (lineIdx < linesToProcess.length - 1) {
      setLineIdx(lineIdx + 1);
    } else {
      onDone();
    }
  }

  async function handleCreateCustomer() {
    if (!newCustomerNombre.trim()) { toast.error('Nombre del cliente requerido'); return; }
    setSavingCustomer(true);
    try {
      const created = await createCustomer({
        razon_social: newCustomerNombre.trim(),
        nit: newCustomerNit.trim() || undefined,
      });
      setCustomers(prev => [...prev, created].sort((a, b) => a.razon_social.localeCompare(b.razon_social)));
      setCustomerId(created.id);
      setCreatingCustomer(false);
      setNewCustomerNombre(''); setNewCustomerNit('');
      toast.success('Cliente creado');
    } catch (e: any) {
      toast.error(e.message || 'Error al crear el cliente');
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleCreateNew() {
    if (!numeroDocumento.trim()) { toast.error('N° de documento requerido'); return; }
    if (line.modulo === 'cxp' && !proveedorNombre.trim()) { toast.error('Nombre del proveedor requerido'); return; }
    setSaving(true);
    try {
      if (line.modulo === 'cxp') {
        const { error } = await (supabase.rpc('attach_payable_to_journal_line' as any, {
          p_company_id: companyId,
          p_journal_entry_id: journalEntry.id,
          p_cuenta_pasivo_id: line.accountId,
          p_cuenta_gasto_id: null,
          p_proveedor_nombre: proveedorNombre.trim(),
          p_proveedor_nit: proveedorNit.trim() || null,
          p_numero_documento: numeroDocumento.trim(),
          p_fecha_emision: journalEntry.date,
          p_fecha_vencimiento: fechaVencimiento || null,
          p_monto_original: line.lineAmount,
          p_moneda: moneda,
          p_notas: null,
        }) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.rpc('attach_receivable_to_journal_line' as any, {
          p_company_id: companyId,
          p_journal_entry_id: journalEntry.id,
          p_cuenta_activo_id: line.accountId,
          p_cuenta_ingreso_id: null,
          p_customer_id: customerId || null,
          p_numero_documento: numeroDocumento.trim(),
          p_fecha_emision: journalEntry.date,
          p_fecha_vencimiento: fechaVencimiento || null,
          p_monto_original: line.lineAmount,
          p_moneda: moneda,
          p_notas: null,
        }) as any);
        if (error) throw error;
      }
      toast.success(`${line.modulo === 'cxp' ? 'CxP' : 'CxC'} creada y vinculada al asiento`);
      advance();
    } catch (e: any) {
      toast.error(e.message || 'Error al crear el registro');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterPayments() {
    const entries = Object.entries(allocations).filter(([, v]) => v && parseFloat(v) > 0);
    if (entries.length === 0) { toast.error('Selecciona al menos un documento y su monto'); return; }
    const total = entries.reduce((s, [, v]) => s + parseFloat(v), 0);
    if (Math.abs(total - line.lineAmount) > 0.01) {
      toast.error(`La suma de los montos (Bs ${fmt(total)}) debe ser igual al monto de la línea (Bs ${fmt(line.lineAmount)})`);
      return;
    }
    setSaving(true);
    try {
      const rpcName = line.modulo === 'cxp' ? 'attach_payable_payment_to_journal_line' : 'attach_receivable_payment_to_journal_line';
      for (const [docId, montoStr] of entries) {
        const idParam = line.modulo === 'cxp' ? { p_payable_id: docId } : { p_receivable_id: docId };
        const { error } = await (supabase.rpc(rpcName as any, {
          p_company_id: companyId,
          p_journal_entry_id: journalEntry.id,
          ...idParam,
          p_monto: parseFloat(montoStr),
          p_fecha: journalEntry.date,
          p_tipo_pago: line.accountName,
          p_notas: null,
        }) as any);
        if (error) throw error;
      }
      toast.success('Pago registrado y vinculado al asiento');
      advance();
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar el pago');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => { /* no se cierra por fuera: el asiento ya se guardó */ }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Vincular {line.modulo === 'cxp' ? 'Cuenta por Pagar' : 'Cuenta por Cobrar'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Línea {lineIdx + 1} de {linesToProcess.length} · Asiento {journalEntry.id} ya guardado
          </div>

          <Card>
            <CardContent className="p-3 text-sm space-y-1">
              <div className="font-medium">{line.accountName}</div>
              <div className="text-muted-foreground">
                {line.isIncrease ? 'Incrementa' : 'Reduce'} la cuenta — Bs {fmt(line.lineAmount)}
              </div>
            </CardContent>
          </Card>

          {line.isIncrease ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Esta línea genera una {line.modulo === 'cxp' ? 'Cuenta por Pagar' : 'Cuenta por Cobrar'} nueva.
              </p>
              {line.modulo === 'cxp' ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Proveedor *</Label>
                    <Input value={proveedorNombre} onChange={e => setProveedorNombre(e.target.value)} placeholder="Nombre o razón social..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">NIT (opcional)</Label>
                    <Input value={proveedorNit} onChange={e => setProveedorNit(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Cliente (opcional)</Label>
                  {!creatingCustomer ? (
                    <div className="flex gap-2">
                      <Select value={customerId || '__none__'} onValueChange={v => setCustomerId(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Sin cliente asociado" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin cliente asociado</SelectItem>
                          {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" onClick={() => setCreatingCustomer(true)} title="Crear nuevo cliente">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 border rounded-md p-2">
                      <Input
                        value={newCustomerNombre}
                        onChange={e => setNewCustomerNombre(e.target.value)}
                        placeholder="Razón social del cliente nuevo"
                      />
                      <Input
                        value={newCustomerNit}
                        onChange={e => setNewCustomerNit(e.target.value)}
                        placeholder="NIT (opcional)"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingCustomer(false)} disabled={savingCustomer}>
                          Cancelar
                        </Button>
                        <Button type="button" size="sm" onClick={handleCreateCustomer} disabled={savingCustomer}>
                          {savingCustomer ? 'Guardando...' : 'Guardar cliente'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">N° Documento *</Label>
                <Input value={numeroDocumento} onChange={e => setNumeroDocumento(e.target.value)} placeholder="Ej. FACT-001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Vencimiento (opcional)</Label>
                  <Input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOB">BOB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Esta línea reduce la cuenta — selecciona qué {line.modulo === 'cxp' ? 'CxP' : 'CxC'} abiertas se pagan
                (la suma de los montos debe ser Bs {fmt(line.lineAmount)}).
              </p>
              {loadingDocs ? (
                <p className="text-sm text-muted-foreground">Cargando...</p>
              ) : openDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay documentos abiertos en esta cuenta.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {openDocs.map(doc => {
                    const currentSum = Object.entries(allocations)
                      .filter(([docId]) => docId !== doc.id)
                      .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
                    const suggested = round2(Math.max(0, Math.min(line.lineAmount - currentSum, doc.monto_pendiente)));
                    return (
                      <div key={doc.id} className="flex items-center gap-2 border rounded p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.numero_documento} · pendiente {doc.moneda} {fmt(doc.monto_pendiente)}
                          </p>
                        </div>
                        {!allocations[doc.id] && suggested > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setAllocations(prev => ({ ...prev, [doc.id]: String(suggested) }))}
                          >
                            Usar {fmt(suggested)}
                          </Button>
                        )}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 h-8"
                          placeholder="0.00"
                          value={allocations[doc.id] ?? ''}
                          onChange={e => setAllocations(prev => ({ ...prev, [doc.id]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={advance} disabled={saving}>
            Omitir esta línea
          </Button>
          <Button
            onClick={line.isIncrease ? handleCreateNew : handleRegisterPayments}
            disabled={saving || (!line.isIncrease && openDocs.length === 0)}
          >
            {saving ? 'Guardando...' : line.isIncrease ? `Crear ${line.modulo === 'cxp' ? 'CxP' : 'CxC'}` : 'Registrar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
