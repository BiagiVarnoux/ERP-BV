import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CreditCard, Loader2, Banknote, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt, round2, todayISO, nowInAppTZ } from '@/accounting/utils';
import { getMonthEndDate } from '@/accounting/period-utils';
import {
  listPayables,
  createPayable,
  registerPayablePayment,
  type PayableRow,
  type Moneda,
} from '@/domain/payables';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => todayISO();

function isVencido(row: PayableRow): boolean {
  if (!row.fecha_vencimiento) return false;
  if (row.estado !== 'open' && row.estado !== 'partial') return false;
  return row.fecha_vencimiento < today();
}

function estadoBadge(row: PayableRow) {
  if (row.estado === 'paid')    return <Badge className="bg-green-600 hover:bg-green-700 text-xs">Pagado</Badge>;
  if (row.estado === 'voided')  return <Badge variant="outline" className="text-xs text-muted-foreground">Anulado</Badge>;
  if (row.estado === 'partial') return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Parcial</Badge>;
  return <Badge className="bg-blue-600 hover:bg-blue-700 text-xs">Abierto</Badge>;
}

function pendienteCellClass(row: PayableRow): string {
  if (row.estado === 'paid')    return 'text-right font-medium text-green-600';
  if (isVencido(row))           return 'text-right font-medium text-red-600';
  if (row.estado === 'partial') return 'text-right font-medium text-amber-600';
  return 'text-right font-medium';
}

const TIPO_PAGO_OPTIONS = [
  'Caja MN',
  'Banco MN',
  'Banco ME',
  'Facebank',
  'Facebank 2',
  'Facebank 3',
  'USDT',
  'USDT 2',
] as const;

type EstadoFilter = 'all' | 'open' | 'vencidos' | 'paid';

function estadoFilterLabel(f: EstadoFilter): string {
  switch (f) {
    case 'all':      return 'Todos';
    case 'open':     return 'Abiertos';
    case 'vencidos': return 'Vencidos';
    case 'paid':     return 'Pagados';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayablesPage() {
  const { can } = useUserAccess();
  const canCreate = can('payables', 'create');
  const canEdit   = can('payables', 'edit');
  const activeCompanyId = useActiveCompanyId();
  const [rows, setRows]       = useState<PayableRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('open');
  const [search, setSearch]             = useState('');

  // KPI — pagado este mes (from debt_payments)
  const [pagadoMes, setPagadoMes] = useState(0);

  // Payment modal
  const [payTarget, setPayTarget] = useState<PayableRow | null>(null);
  const [payFecha, setPayFecha]   = useState(today());
  const [payMonto, setPayMonto]   = useState('');
  const [payTipo, setPayTipo]     = useState<string>(TIPO_PAGO_OPTIONS[0]);
  const [payNotas, setPayNotas]   = useState('');
  const [paying, setPaying]       = useState(false);

  // Create modal
  const [showCreate, setShowCreate]                 = useState(false);
  const [createProveedor, setCreateProveedor]       = useState('');
  const [createNit, setCreateNit]                   = useState('');
  const [createNumero, setCreateNumero]             = useState('');
  const [createFechaEmision, setCreateFechaEmision] = useState(today());
  const [createFechaVenc, setCreateFechaVenc]       = useState('');
  const [createMonto, setCreateMonto]               = useState('');
  const [createMoneda, setCreateMoneda]             = useState<Moneda>('BOB');
  const [createNotas, setCreateNotas]               = useState('');
  const [creating, setCreating]                     = useState(false);

  useEffect(() => { load(); loadPagadoMes(); }, []);

  async function load() {
    setLoading(true);
    try {
      setRows(await listPayables());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando CxP');
    } finally {
      setLoading(false);
    }
  }

  async function loadPagadoMes() {
    const { year, month } = nowInAppTZ();
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to   = getMonthEndDate(year, month);
    const { data } = await (supabase
      .from('debt_payments' as any)
      .select('monto')
      .eq('company_id', activeCompanyId)
      .not('payable_id', 'is', null)
      .gte('fecha', from)
      .lte('fecha', to) as any);
    const total = round2(((data ?? []) as { monto: number }[]).reduce((s, r) => s + r.monto, 0));
    setPagadoMes(total);
  }

  // ── Filtered rows ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      const matchSearch = !q
        || r.numero_documento.toLowerCase().includes(q)
        || r.proveedor_nombre.toLowerCase().includes(q)
        || (r.proveedor_nit ?? '').toLowerCase().includes(q);

      const isOpenLike = r.estado === 'open' || r.estado === 'partial';
      let matchEstado = true;
      if (estadoFilter === 'open')     matchEstado = isOpenLike;
      if (estadoFilter === 'vencidos') matchEstado = isOpenLike && isVencido(r);
      if (estadoFilter === 'paid')     matchEstado = r.estado === 'paid';

      return matchSearch && matchEstado;
    });
  }, [rows, estadoFilter, search]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const openRows  = rows.filter(r => r.estado === 'open' || r.estado === 'partial');
    const totalPend = round2(openRows.reduce((s, r) => s + r.monto_pendiente, 0));
    const countOpen = openRows.length;
    const countVenc = openRows.filter(isVencido).length;
    return { totalPend, countOpen, countVenc };
  }, [rows]);

  // ── Payment modal ─────────────────────────────────────────────────────────────

  function openPayModal(row: PayableRow) {
    setPayTarget(row);
    setPayFecha(today());
    setPayMonto(String(row.monto_pendiente));
    setPayTipo(TIPO_PAGO_OPTIONS[0]);
    setPayNotas('');
  }

  async function submitPayment() {
    if (!payTarget) return;
    const monto = parseFloat(payMonto);
    if (isNaN(monto) || monto <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }
    if (monto > payTarget.monto_pendiente) {
      toast.error(`El monto no puede superar el pendiente (${fmt(payTarget.monto_pendiente)})`);
      return;
    }
    setPaying(true);
    try {
      await registerPayablePayment({
        payable_id: payTarget.id,
        fecha:      payFecha,
        monto,
        tipo_pago:  payTipo,
        notas:      payNotas || null,
      });
      toast.success('Pago registrado correctamente');
      setPayTarget(null);
      await Promise.all([load(), loadPagadoMes()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error registrando pago');
    } finally {
      setPaying(false);
    }
  }

  // ── Create modal ──────────────────────────────────────────────────────────────

  function openCreateModal() {
    setCreateProveedor('');
    setCreateNit('');
    setCreateNumero('');
    setCreateFechaEmision(today());
    setCreateFechaVenc('');
    setCreateMonto('');
    setCreateMoneda('BOB');
    setCreateNotas('');
    setShowCreate(true);
  }

  async function submitCreate() {
    if (!createProveedor.trim()) { toast.error('Nombre del proveedor requerido'); return; }
    if (!createNumero.trim())    { toast.error('Nº Documento requerido'); return; }
    const monto = parseFloat(createMonto);
    if (isNaN(monto) || monto <= 0) { toast.error('Monto inválido'); return; }

    setCreating(true);
    try {
      await createPayable({
        proveedor_nombre:  createProveedor.trim(),
        proveedor_nit:     createNit.trim() || null,
        numero_documento:  createNumero.trim(),
        fecha_emision:     createFechaEmision,
        fecha_vencimiento: createFechaVenc || null,
        monto_original:    monto,
        moneda:            createMoneda,
        notas:             createNotas || null,
      });
      toast.success('CxP creada correctamente');
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error creando CxP');
    } finally {
      setCreating(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CreditCard className="w-6 h-6" /> Cuentas por Pagar
        </h1>
        {canCreate && (
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" /> Nueva CxP
          </Button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Banknote className="w-4 h-4" /> Total pendiente
          </div>
          <div className="text-2xl font-bold">Bs {fmt(kpis.totalPend)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" /> Documentos abiertos
          </div>
          <div className="text-2xl font-bold">{kpis.countOpen}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Vencidos
          </div>
          <div className={`text-2xl font-bold ${kpis.countVenc > 0 ? 'text-red-600' : ''}`}>
            {kpis.countVenc}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500" /> Pagado este mes
          </div>
          <div className="text-2xl font-bold text-green-600">Bs {fmt(pagadoMes)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-md border overflow-hidden">
          {(['all', 'open', 'vencidos', 'paid'] as EstadoFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setEstadoFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${estadoFilter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {estadoFilterLabel(f)}
            </button>
          ))}
        </div>
        <Input
          className="max-w-xs"
          placeholder="Buscar por Nº documento, proveedor o NIT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CreditCard className="w-12 h-12 mb-4 opacity-40" />
          <p>No hay cuentas por pagar registradas.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Documento</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Fecha emisión</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto original</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(row => {
                const venc   = isVencido(row);
                const canPay = canEdit && row.estado !== 'paid' && row.estado !== 'voided';
                return (
                  <TableRow key={row.id} className={row.estado === 'voided' ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-xs">{row.numero_documento}</TableCell>
                    <TableCell className="text-sm font-medium">{row.proveedor_nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {row.proveedor_nit ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">{row.fecha_emision}</TableCell>
                    <TableCell className="text-sm">
                      {row.fecha_vencimiento ? (
                        <span className="flex items-center gap-1.5">
                          {row.fecha_vencimiento}
                          {venc && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              VENCIDO
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                          Sin fecha
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                          {row.moneda}
                        </Badge>
                        {fmt(row.monto_original)}
                      </span>
                    </TableCell>
                    <TableCell className={pendienteCellClass(row)}>
                      {fmt(row.monto_pendiente)}
                    </TableCell>
                    <TableCell className="text-center">
                      {estadoBadge(row)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canPay}
                        onClick={() => openPayModal(row)}
                        className="h-7 text-xs"
                      >
                        Registrar pago
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Register payment modal ─────────────────────────────────────────── */}
      <Dialog open={!!payTarget} onOpenChange={o => !o && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>

          {payTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-1">
                <div className="font-mono text-xs text-muted-foreground">{payTarget.numero_documento}</div>
                <div className="font-medium">{payTarget.proveedor_nombre}</div>
                {payTarget.proveedor_nit && (
                  <div className="text-xs text-muted-foreground">NIT: {payTarget.proveedor_nit}</div>
                )}
                <div>
                  Pendiente:{' '}
                  <span className="font-semibold">
                    {payTarget.moneda} {fmt(payTarget.monto_pendiente)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay-fecha">Fecha</Label>
                <Input
                  id="pay-fecha"
                  type="date"
                  value={payFecha}
                  onChange={e => setPayFecha(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay-monto">
                  Monto a pagar{' '}
                  <span className="text-xs text-muted-foreground">
                    (máx. {fmt(payTarget.monto_pendiente)})
                  </span>
                </Label>
                <Input
                  id="pay-monto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={payTarget.monto_pendiente}
                  value={payMonto}
                  onChange={e => setPayMonto(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay-tipo">Tipo de pago</Label>
                <Select value={payTipo} onValueChange={setPayTipo}>
                  <SelectTrigger id="pay-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_PAGO_OPTIONS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay-notas">Notas (opcional)</Label>
                <Textarea
                  id="pay-notas"
                  rows={2}
                  placeholder="Referencia, observaciones..."
                  value={payNotas}
                  onChange={e => setPayNotas(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={paying}>
              Cancelar
            </Button>
            <Button onClick={submitPayment} disabled={paying}>
              {paying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create payable modal ───────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta por Pagar</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="c-proveedor">Proveedor <span className="text-destructive">*</span></Label>
                <Input
                  id="c-proveedor"
                  placeholder="Nombre o razón social..."
                  value={createProveedor}
                  onChange={e => setCreateProveedor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-nit">NIT (opcional)</Label>
                <Input
                  id="c-nit"
                  placeholder="Ej. 1234567"
                  value={createNit}
                  onChange={e => setCreateNit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-numero">Nº Documento <span className="text-destructive">*</span></Label>
                <Input
                  id="c-numero"
                  placeholder="Ej. FACT-001..."
                  value={createNumero}
                  onChange={e => setCreateNumero(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="c-fecha-em">Fecha emisión</Label>
                <Input
                  id="c-fecha-em"
                  type="date"
                  value={createFechaEmision}
                  onChange={e => setCreateFechaEmision(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-fecha-venc">Vencimiento (opcional)</Label>
                <Input
                  id="c-fecha-venc"
                  type="date"
                  value={createFechaVenc}
                  onChange={e => setCreateFechaVenc(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="c-monto">Monto original <span className="text-destructive">*</span></Label>
                <Input
                  id="c-monto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={createMonto}
                  onChange={e => setCreateMonto(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-moneda">Moneda</Label>
                <Select value={createMoneda} onValueChange={v => setCreateMoneda(v as Moneda)}>
                  <SelectTrigger id="c-moneda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-notas">Notas (opcional)</Label>
              <Textarea
                id="c-notas"
                rows={2}
                placeholder="Observaciones adicionales..."
                value={createNotas}
                onChange={e => setCreateNotas(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Crear CxP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
