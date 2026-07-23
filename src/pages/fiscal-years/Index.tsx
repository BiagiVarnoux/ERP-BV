// src/pages/fiscal-years/Index.tsx
// Gestión de Ejercicios Fiscales
// Modelo QuickBooks/Xero: sin asientos de cierre; la separación se hace
// por cálculo dinámico en reportes. Esta página gestiona el estado OPEN/CLOSED.
import React, { useState } from 'react';
import { useAccounting } from '@/accounting/AccountingProvider';
import { FiscalYear } from '@/accounting/types';
import { computePeriodResult } from '@/accounting/fiscal-year-utils';
import { fmt } from '@/accounting/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Lock, LockOpen, Plus, AlertTriangle } from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// ── helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: FiscalYear['status']) {
  return status === 'CLOSED'
    ? <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><Lock className="w-3 h-3 mr-1" />Cerrada</Badge>
    : <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><LockOpen className="w-3 h-3 mr-1" />Abierta</Badge>;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function FiscalYearsPage() {
  const { accounts, entries, fiscalYears, setFiscalYears } = useAccounting();
  const { user } = useAuth();

  // ── dialog state ──────────────────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen]       = useState(false);
  const [closeDialogOpen, setCloseDialogOpen]   = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [targetFY, setTargetFY]                 = useState<FiscalYear | null>(null);
  const [saving, setSaving]                     = useState(false);

  // new gestión form
  const [newYear, setNewYear]   = useState(String(new Date().getFullYear()));
  const [newNotes, setNewNotes] = useState('');

  // ── computed ──────────────────────────────────────────────────────────────
  const sorted = [...fiscalYears].sort((a, b) => a.year - b.year);

  function getNetResult(fy: FiscalYear): number {
    if (fy.net_result_snapshot !== null) return fy.net_result_snapshot;
    return computePeriodResult(accounts, entries, fy.start_date, fy.end_date).resultado;
  }

  // ── add gestión ───────────────────────────────────────────────────────────
  async function handleAdd() {
    const year = parseInt(newYear, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      toast.error('Año inválido');
      return;
    }
    if (fiscalYears.some(fy => fy.year === year)) {
      toast.error(`Ya existe la gestión ${year}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id:  COMPANY_ID,
        year,
        start_date:  `${year}-01-01`,
        end_date:    `${year}-12-31`,
        status:      'OPEN',
        notes:       newNotes.trim() || null,
      };
      const { data, error } = await supabase!
        .from('fiscal_years')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setFiscalYears(prev => [...prev, data as FiscalYear].sort((a, b) => a.year - b.year));
      setAddDialogOpen(false);
      setNewYear(String(new Date().getFullYear()));
      setNewNotes('');
      toast.success(`Gestión ${year} creada`);
    } catch (e: any) {
      toast.error(e.message || 'Error al crear gestión');
    } finally {
      setSaving(false);
    }
  }

  // ── close gestión ─────────────────────────────────────────────────────────
  function openCloseDialog(fy: FiscalYear) {
    // Rule: no prior OPEN gestiones allowed
    const priorOpen = sorted.find(f => f.year < fy.year && f.status === 'OPEN');
    if (priorOpen) {
      toast.error(`Debe cerrar primero la gestión ${priorOpen.year} antes de cerrar la gestión ${fy.year}`);
      return;
    }
    setTargetFY(fy);
    setCloseDialogOpen(true);
  }

  async function handleClose() {
    if (!targetFY) return;
    setSaving(true);
    try {
      const netResult = getNetResult(targetFY);
      const { data, error } = await supabase!
        .from('fiscal_years')
        .update({
          status:              'CLOSED',
          net_result_snapshot: netResult,
          closed_at:           new Date().toISOString(),
          closed_by:           user?.id ?? null,
        })
        .eq('id', targetFY.id)
        .select()
        .single();
      if (error) throw error;
      setFiscalYears(prev => prev.map(f => f.id === targetFY.id ? (data as FiscalYear) : f));
      setCloseDialogOpen(false);
      toast.success(`Gestión ${targetFY.year} cerrada. Resultado: ${fmt(netResult)}`);
    } catch (e: any) {
      toast.error(e.message || 'Error al cerrar gestión');
    } finally {
      setSaving(false);
    }
  }

  // ── reopen gestión ────────────────────────────────────────────────────────
  function openReopenDialog(fy: FiscalYear) {
    setTargetFY(fy);
    setReopenDialogOpen(true);
  }

  // Gestiones posteriores que también están CLOSED (deben reabrirse en cascada)
  function posteriorClosed(fy: FiscalYear): FiscalYear[] {
    return sorted.filter(f => f.year > fy.year && f.status === 'CLOSED');
  }

  async function handleReopen() {
    if (!targetFY) return;
    setSaving(true);
    try {
      // Cascade: reopen this fy + all later CLOSED ones
      const toReopen = [targetFY, ...posteriorClosed(targetFY)];
      for (const fy of toReopen) {
        const { data, error } = await supabase!
          .from('fiscal_years')
          .update({
            status:              'OPEN',
            net_result_snapshot: null,
            closed_at:           null,
            closed_by:           null,
          })
          .eq('id', fy.id)
          .select()
          .single();
        if (error) throw error;
        setFiscalYears(prev => prev.map(f => f.id === fy.id ? (data as FiscalYear) : f));
      }
      setReopenDialogOpen(false);
      toast.success(
        toReopen.length > 1
          ? `Gestiones ${toReopen.map(f => f.year).join(', ')} reabiertas en cascada`
          : `Gestión ${targetFY.year} reabierta`
      );
    } catch (e: any) {
      toast.error(e.message || 'Error al reabrir gestión');
    } finally {
      setSaving(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const closedPosterior = targetFY ? posteriorClosed(targetFY) : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Gestiones Fiscales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administra los ejercicios contables. El cierre es lógico — no genera asientos.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Gestión
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ejercicios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay gestiones registradas. El sistema trata todos los períodos como abiertos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Año</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Resultado Neto</TableHead>
                  <TableHead>Cerrada el</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(fy => (
                  <TableRow key={fy.id}>
                    <TableCell className="font-semibold">{fy.year}</TableCell>
                    <TableCell className="font-mono text-xs">{fy.start_date}</TableCell>
                    <TableCell className="font-mono text-xs">{fy.end_date}</TableCell>
                    <TableCell>{statusBadge(fy.status)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${getNetResult(fy) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(getNetResult(fy))}
                      {fy.net_result_snapshot !== null && (
                        <span className="ml-1 text-xs text-muted-foreground">(snapshot)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fy.closed_at ? new Date(fy.closed_at).toLocaleDateString('es-BO') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {fy.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {fy.status === 'OPEN' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCloseDialog(fy)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Lock className="h-3.5 w-3.5 mr-1" />
                          Cerrar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReopenDialog(fy)}
                          className="text-amber-600 border-amber-300 hover:bg-amber-50"
                        >
                          <LockOpen className="h-3.5 w-3.5 mr-1" />
                          Reabrir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add dialog ── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Gestión Fiscal</DialogTitle>
            <DialogDescription>
              Se creará con estado ABIERTA. El año determina el rango 01/01 – 31/12.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Año</Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={newYear}
                onChange={e => setNewYear(e.target.value)}
              />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Observaciones sobre esta gestión..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Guardando…' : 'Crear Gestión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close dialog ── */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Gestión {targetFY?.year}</DialogTitle>
            <DialogDescription>
              Se registrará el resultado neto calculado en este momento como snapshot inmutable.
              No se generarán asientos de cierre.
            </DialogDescription>
          </DialogHeader>
          {targetFY && (
            <div className="py-4 space-y-3">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Período:</span>
                  <span className="font-mono">{targetFY.start_date} – {targetFY.end_date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Resultado Neto (calculado):</span>
                  <span className={`font-semibold ${getNetResult(targetFY) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(getNetResult(targetFY))}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Al cerrar esta gestión no podrán registrarse nuevos asientos con fechas
                  dentro del período <strong>{targetFY.year}</strong>. Para hacer ajustes posteriores
                  deberás reabrir la gestión.
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleClose}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? 'Cerrando…' : `Cerrar Gestión ${targetFY?.year}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reopen dialog ── */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Gestión {targetFY?.year}</DialogTitle>
            <DialogDescription>
              Esta acción es delicada. Permite registrar asientos en un período ya cerrado.
            </DialogDescription>
          </DialogHeader>
          {targetFY && (
            <div className="py-4 space-y-3">
              {closedPosterior.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Existen gestiones posteriores cerradas que también se reabrirán en cascada:{' '}
                    <strong>{closedPosterior.map(f => f.year).join(', ')}</strong>.
                    Deberás volver a cerrarlas cuando termines tus ajustes.
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  El snapshot de resultado neto se borrará. Al volver a cerrar se recalculará
                  con los asientos vigentes en ese momento.
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleReopen}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {saving
                ? 'Reabriendo…'
                : closedPosterior.length > 0
                  ? `Reabrir ${[targetFY!, ...closedPosterior].map(f => f.year).join(', ')} en cascada`
                  : `Reabrir Gestión ${targetFY?.year}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
