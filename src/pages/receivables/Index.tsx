import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ReceiptText, Loader2, Banknote, AlertTriangle, CheckCircle2, Clock, Building2, Zap, ShoppingCart, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt, round2, todayISO, nowInAppTZ } from '@/accounting/utils';
import { getMonthEndDate } from '@/accounting/period-utils';
import { useAccounting } from '@/accounting/AccountingProvider';
import { AccountCombobox } from '@/components/journal/AccountCombobox';
import { listCustomers } from '@/domain/customers';
import type { CustomerRow } from '@/domain/customers';
import {
  listReceivables,
  createReceivable,
  registerPayment,
  voidReceivable,
  type ReceivableRow,
  type Moneda,
  type CanalFilter,
} from '@/domain/receivables';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => todayISO();

function isVencido(row: ReceivableRow): boolean {
  if (!row.fecha_vencimiento) return false;
  if (row.estado !== 'open' && row.estado !== 'partial') return false;
  return row.fecha_vencimiento < today();
}

function estadoBadge(row: ReceivableRow) {
  if (row.estado === 'paid')   return <Badge className="bg-green-600 hover:bg-green-700 text-xs">Cobrado</Badge>;
  if (row.estado === 'voided') return <Badge variant="outline" className="text-xs text-muted-foreground">Anulado</Badge>;
  if (row.estado === 'partial') return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Parcial</Badge>;
  return <Badge className="bg-blue-600 hover:bg-blue-700 text-xs">Abierto</Badge>;
}

function pendienteCellClass(row: ReceivableRow): string {
  if (row.estado === 'paid') return 'text-right font-medium text-green-600';
  if (isVencido(row))        return 'text-right font-medium text-red-600';
  if (row.estado === 'partial') return 'text-right font-medium text-amber-600';
  return 'text-right font-medium';
}

type EstadoFilter = 'all' | 'open' | 'vencidos' | 'paid';

function estadoFilterLabel(f: EstadoFilter): string {
  switch (f) {
    case 'all':      return 'Todos';
    case 'open':     return 'Abiertos';
    case 'vencidos': return 'Vencidos';
    case 'paid':     return 'Cobrados';
  }
}

interface CanalTab {
  key: CanalFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const CANAL_TABS: CanalTab[] = [
  { key: 'all',        label: 'Todos',        icon: <ReceiptText className="w-3.5 h-3.5" />, color: '' },
  { key: 'licitacion', label: 'Licitaciones', icon: <Building2 className="w-3.5 h-3.5" />,   color: 'text-violet-600' },
  { key: 'electronica', label: 'Electrónica', icon: <Zap className="w-3.5 h-3.5" />,          color: 'text-blue-600' },
  { key: 'pedido',     label: 'Pedido',       icon: <ShoppingCart className="w-3.5 h-3.5" />, color: 'text-emerald-600' },
  { key: 'general',   label: 'General',      icon: <Globe className="w-3.5 h-3.5" />,         color: 'text-orange-600' },
  { key: 'sin_canal',  label: 'Sin canal',    icon: null,                                       color: 'text-muted-foreground' },
];

function matchesCanal(row: ReceivableRow, canal: CanalFilter): boolean {
  if (canal === 'all') return true;
  if (canal === 'sin_canal') return !row.sale_canal;
  return row.sale_canal === canal;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReceivablesPage() {
  const { can } = useUserAccess();
  const canCreate = can('receivables', 'create');
  const canEdit   = can('receivables', 'edit');
  const activeCompanyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const cuentasActivo  = useMemo(() => accounts.filter(a => a.type === 'ACTIVO'), [accounts]);
  const cuentasIngreso = useMemo(() => accounts.filter(a => a.type === 'INGRESO'), [accounts]);
  const [rows, setRows]       = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  // Filters
  const [canalFilter, setCanalFilter]   = useState<CanalFilter>('all');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('open');
  const [search, setSearch]             = useState('');

  // KPI — cobrado este mes (from debt_payments)
  const [cobradoMes, setCobradoMes] = useState(0);

  // Payment modal
  const [payTarget, setPayTarget]   = useState<ReceivableRow | null>(null);
  const [payFecha, setPayFecha]     = useState(today());
  const [payMonto, setPayMonto]     = useState('');
  const [payCuentaPago, setPayCuentaPago] = useState('');
  const [payNotas, setPayNotas]     = useState('');
  const [paying, setPaying]         = useState(false);

  // Create modal
  const [showCreate, setShowCreate]             = useState(false);
  const [createNumero, setCreateNumero]         = useState('');
  const [createFechaEmision, setCreateFechaEmision] = useState(today());
  const [createFechaVenc, setCreateFechaVenc]   = useState('');
  const [createMonto, setCreateMonto]           = useState('');
  const [createMoneda, setCreateMoneda]         = useState<Moneda>('BOB');
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createNotas, setCreateNotas]           = useState('');
  const [createCuentaActivo, setCreateCuentaActivo]   = useState('');
  const [createCuentaIngreso, setCreateCuentaIngreso] = useState('');
  const [creating, setCreating]                 = useState(false);

  useEffect(() => { load(); loadCobradoMes(); listCustomers().then(setCustomers).catch(() => setCustomers([])); }, []);

  async function load() {
    setLoading(true);
    try {
      setRows(await listReceivables());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando CxC');
    } finally {
      setLoading(false);
    }
  }

  async function loadCobradoMes() {
    const { year, month } = nowInAppTZ();
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to   = getMonthEndDate(year, month);
    const { data } = await supabase
      .from('debt_payments')
      .select('monto')
      .eq('company_id', activeCompanyId)
      .not('receivable_id', 'is', null)
      .gte('fecha', from)
      .lte('fecha', to);
    const total = round2(((data ?? []) as { monto: number }[]).reduce((s, r) => s + r.monto, 0));
    setCobradoMes(total);
  }

  // ── Canal summary (for tabs) ─────────────────────────────────────────────────

  const canalSummary = useMemo(() => {
    const openRows = rows.filter(r => r.estado === 'open' || r.estado === 'partial');
    const summary: Record<CanalFilter, { count: number; pendiente: number }> = {
      all:        { count: openRows.length, pendiente: round2(openRows.reduce((s, r) => s + r.monto_pendiente, 0)) },
      licitacion: { count: 0, pendiente: 0 },
      electronica:{ count: 0, pendiente: 0 },
      pedido:     { count: 0, pendiente: 0 },
      general:    { count: 0, pendiente: 0 },
      sin_canal:  { count: 0, pendiente: 0 },
    };
    for (const r of openRows) {
      const c: CanalFilter = (r.sale_canal as CanalFilter | null) ?? 'sin_canal';
      const key = ['licitacion', 'electronica', 'pedido', 'general'].includes(c) ? c : 'sin_canal';
      summary[key].count++;
      summary[key].pendiente = round2(summary[key].pendiente + r.monto_pendiente);
    }
    return summary;
  }, [rows]);

  // ── Filtered rows ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      const matchCanal = matchesCanal(r, canalFilter);

      const matchSearch = !q
        || r.numero_documento.toLowerCase().includes(q)
        || (r.customer_razon_social ?? '').toLowerCase().includes(q);

      const isOpenLike = r.estado === 'open' || r.estado === 'partial';
      let matchEstado = true;
      if (estadoFilter === 'open')     matchEstado = isOpenLike;
      if (estadoFilter === 'vencidos') matchEstado = isOpenLike && isVencido(r);
      if (estadoFilter === 'paid')     matchEstado = r.estado === 'paid';

      return matchCanal && matchSearch && matchEstado;
    });
  }, [rows, canalFilter, estadoFilter, search]);

  // ── KPIs (for active canal) ───────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const scope = canalFilter === 'all' ? rows : rows.filter(r => matchesCanal(r, canalFilter));
    const openRows   = scope.filter(r => r.estado === 'open' || r.estado === 'partial');
    const totalPend  = round2(openRows.reduce((s, r) => s + r.monto_pendiente, 0));
    const countOpen  = openRows.length;
    const countVenc  = openRows.filter(isVencido).length;
    return { totalPend, countOpen, countVenc };
  }, [rows, canalFilter]);

  // ── Payment modal ─────────────────────────────────────────────────────────────

  function openPayModal(row: ReceivableRow) {
    setPayTarget(row);
    setPayFecha(today());
    setPayMonto(String(row.monto_pendiente));
    setPayCuentaPago('');
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
    if (!payCuentaPago) {
      toast.error('Selecciona la cuenta de banco/caja donde cobras');
      return;
    }
    if (!payTarget.cuenta_activo_id) {
      toast.error('Esta CxC fue creada antes de vincularse al libro diario y no puede generar el asiento de cobro automáticamente.');
      return;
    }
    const cuentaPago = accounts.find(a => a.id === payCuentaPago);
    setPaying(true);
    try {
      await registerPayment({
        receivable_id:  payTarget.id,
        fecha:          payFecha,
        monto,
        tipo_pago:      cuentaPago?.name ?? payCuentaPago,
        cuenta_pago_id: payCuentaPago,
        notas:          payNotas || null,
      });
      toast.success('Cobro registrado y asiento generado correctamente');
      setPayTarget(null);
      await Promise.all([load(), loadCobradoMes()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error registrando cobro');
    } finally {
      setPaying(false);
    }
  }

  // ── Create modal ──────────────────────────────────────────────────────────────

  function openCreateModal() {
    setCreateNumero('');
    setCreateFechaEmision(today());
    setCreateFechaVenc('');
    setCreateMonto('');
    setCreateMoneda('BOB');
    setCreateCustomerId('');
    setCreateNotas('');
    setCreateCuentaActivo('');
    setCreateCuentaIngreso('');
    setShowCreate(true);
  }

  async function submitCreate() {
    if (!createNumero.trim()) { toast.error('Nº Documento requerido'); return; }
    const monto = parseFloat(createMonto);
    if (isNaN(monto) || monto <= 0) { toast.error('Monto inválido'); return; }
    if (!createCuentaActivo)  { toast.error('Selecciona la cuenta por cobrar (débito)'); return; }
    if (!createCuentaIngreso) { toast.error('Selecciona la cuenta de ingreso (crédito)'); return; }

    setCreating(true);
    try {
      await createReceivable({
        customer_id:       createCustomerId || null,
        numero_documento:  createNumero.trim(),
        fecha_emision:     createFechaEmision,
        fecha_vencimiento: createFechaVenc || null,
        monto_original:    monto,
        moneda:            createMoneda,
        notas:             createNotas || null,
        cuenta_activo_id:  createCuentaActivo,
        cuenta_ingreso_id: createCuentaIngreso,
      });
      toast.success('CxC creada y asiento generado correctamente');
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error creando CxC');
    } finally {
      setCreating(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const activeTab = CANAL_TABS.find(t => t.key === canalFilter) ?? CANAL_TABS[0];

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold flex items-center gap-2">
          <ReceiptText className="w-6 h-6" /> Cuentas por Cobrar
        </h1>
        {canCreate && (
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" /> Nueva CxC
          </Button>
        )}
      </div>

      {/* Canal tabs */}
      <div className="flex items-center gap-1 border-b">
        {CANAL_TABS.map(tab => {
          const isActive = canalFilter === tab.key;
          const summary = canalSummary[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setCanalFilter(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.icon && <span className={isActive ? tab.color : ''}>{tab.icon}</span>}
              {tab.label}
              {summary.count > 0 && (
                <Badge
                  variant={isActive ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5 py-0 h-4 min-w-4"
                >
                  {summary.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Banknote className="w-4 h-4" />
            Total pendiente
            {canalFilter !== 'all' && (
              <span className={`text-xs font-medium ${activeTab.color}`}>· {activeTab.label}</span>
            )}
          </div>
          <div className="text-xl sm:text-2xl font-bold">Bs {fmt(kpis.totalPend)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" /> Documentos abiertos
          </div>
          <div className="text-xl sm:text-2xl font-bold">{kpis.countOpen}</div>
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
            <CheckCircle2 className="w-4 h-4 text-green-500" /> Cobrado este mes
          </div>
          <div className="text-2xl font-bold text-green-600">Bs {fmt(cobradoMes)}</div>
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
          placeholder="Buscar por Nº documento o cliente..."
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
          <ReceiptText className="w-12 h-12 mb-4 opacity-40" />
          <p>No hay cuentas por cobrar{canalFilter !== 'all' ? ` para ${activeTab.label}` : ''} registradas.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Documento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Canal</TableHead>
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
                const venc = isVencido(row);
                const canPay = canEdit && row.estado !== 'paid' && row.estado !== 'voided';
                return (
                  <TableRow key={row.id} className={row.estado === 'voided' ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-xs">{row.numero_documento}</TableCell>
                    <TableCell className="text-sm">{row.customer_razon_social ?? '—'}</TableCell>
                    <TableCell>
                      {row.sale_canal ? (
                        <CanalBadge canal={row.sale_canal} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                        Registrar cobro
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
            <DialogTitle>Registrar cobro</DialogTitle>
          </DialogHeader>

          {payTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-1">
                <div className="font-mono text-xs text-muted-foreground">{payTarget.numero_documento}</div>
                {payTarget.customer_razon_social && (
                  <div className="font-medium">{payTarget.customer_razon_social}</div>
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
                  Monto a cobrar{' '}
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
                <Label>Cuenta de cobro (banco/caja) <span className="text-destructive">*</span></Label>
                <AccountCombobox value={payCuentaPago} onChange={setPayCuentaPago} accounts={accounts} />
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
              {paying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Registrar cobro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create receivable modal ────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta por Cobrar</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-cliente">Cliente (opcional)</Label>
              <Select value={createCustomerId || '__none__'} onValueChange={v => setCreateCustomerId(v === '__none__' ? '' : v)}>
                <SelectTrigger id="c-cliente"><SelectValue placeholder="Sin cliente asociado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin cliente asociado</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-numero">Nº Documento <span className="text-destructive">*</span></Label>
              <Input
                id="c-numero"
                placeholder="Ej. FACT-001, CXC-2025-001..."
                value={createNumero}
                onChange={e => setCreateNumero(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cuenta por cobrar (Débito) <span className="text-destructive">*</span></Label>
                <AccountCombobox value={createCuentaActivo} onChange={setCreateCuentaActivo} accounts={cuentasActivo} />
              </div>
              <div className="space-y-2">
                <Label>Cuenta de ingreso (Crédito) <span className="text-destructive">*</span></Label>
                <AccountCombobox value={createCuentaIngreso} onChange={setCreateCuentaIngreso} accounts={cuentasIngreso} />
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
              {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Crear CxC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── CanalBadge ───────────────────────────────────────────────────────────────

function CanalBadge({ canal }: { canal: string }) {
  switch (canal) {
    case 'licitacion':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-300">Licitación</Badge>;
    case 'electronica':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300">Electrónica</Badge>;
    case 'pedido':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">Pedido</Badge>;
    case 'general':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-300">General</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{canal}</Badge>;
  }
}
