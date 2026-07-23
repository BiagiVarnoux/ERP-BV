import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, ShoppingCart, Ban, DollarSign, TrendingUp, Percent, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt, round2 } from '@/accounting/utils';
import { listSales, voidSale, CANAL_LABELS, type SaleRow } from '@/domain/sales';
import { useAccounting } from '@/accounting/AccountingProvider';
import { NuevaVentaModal } from '@/components/sales/NuevaVentaModal';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  PeriodFilterBar,
  PeriodFilterValue,
  getDefaultPeriodFilterValue,
  isDateInPeriodFilter,
} from '@/components/shared/PeriodFilterBar';

function margenBadgeClass(pct: number) {
  if (pct < 5) return 'bg-red-100 text-red-700 border-red-300';
  if (pct < 20) return 'bg-amber-100 text-amber-700 border-amber-300';
  return 'bg-green-100 text-green-700 border-green-300';
}

interface SaleItem {
  id: string;
  sale_id: string;
  product_nombre: string;
  product_codigo: string | null;
  cantidad: number;
  precio_unitario_neto: number;
  subtotal_neto: number;
  costo_unitario: number | null;
  costo_total: number | null;      // precalculado por el RPC (usar este)
  margen_bruto: number | null;     // precalculado por el RPC
  created_at: string;
}

export default function SalesPage() {
  const { can } = useUserAccess();
  const canCreate = can('sales', 'create');
  const canEdit   = can('sales', 'edit');
  const canDelete = can('sales', 'delete');
  const { reloadEntries } = useAccounting();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [itemsMap, setItemsMap] = useState<Record<string, string[]>>({});

  // Filtros
  const [period, setPeriod] = usePersistedState<PeriodFilterValue>('sales:period', getDefaultPeriodFilterValue());
  const [search, setSearch] = useState('');

  // Detalle
  const [detailSale, setDetailSale] = useState<SaleRow | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Estado de cobro del detalle (solo para ventas CxC)
  const [receivableEstado, setReceivableEstado] = useState<string | null>(null);

  // Anulación
  const [voidTarget, setVoidTarget] = useState<SaleRow | null>(null);
  const [voidStep, setVoidStep] = useState<1 | 2>(1);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await listSales();
      setSales(data);
      // Batch-fetch productos para mostrar en la tabla
      if (data.length > 0) {
        const saleIds = data.map(s => s.id);
        const { data: items } = await supabase
          .from('sale_items')
          .select('sale_id, product_nombre')
          .in('sale_id', saleIds);
        const map: Record<string, string[]> = {};
        for (const it of items ?? []) {
          if (!map[it.sale_id]) map[it.sale_id] = [];
          map[it.sale_id].push(it.product_nombre);
        }
        setItemsMap(map);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando ventas');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sales.filter(s =>
      isDateInPeriodFilter(s.fecha, period) &&
      (!q || s.numero.toLowerCase().includes(q) || (s.cliente_nombre ?? '').toLowerCase().includes(q) || (s.glosa ?? '').toLowerCase().includes(q))
    );
  }, [sales, period, search]);

  const confirmedFiltered = useMemo(() => filtered.filter(s => s.estado === 'confirmed'), [filtered]);

  const kpis = useMemo(() => {
    const ventas = round2(confirmedFiltered.reduce((sum, s) => sum + s.total_cobrado, 0));
    const transactions = confirmedFiltered.length;
    const withCost = confirmedFiltered.filter(s => s.total_costo !== null);
    const margenBruto = round2(withCost.reduce((sum, s) => sum + (s.precio_neto_total - (s.total_costo ?? 0)), 0));
    const subtotalNeto = round2(withCost.reduce((sum, s) => sum + s.precio_neto_total, 0));
    const margenPct = subtotalNeto > 0 ? round2((margenBruto / subtotalNeto) * 100) : 0;
    return { ventas, transactions, margenBruto, margenPct };
  }, [confirmedFiltered]);

  const tableTotals = useMemo(() => {
    const confirmed = filtered.filter(s => s.estado === 'confirmed');
    const cobrado = round2(confirmed.reduce((sum, s) => sum + s.total_cobrado, 0));
    const costo = round2(
      confirmed.filter(s => s.total_costo !== null)
               .reduce((sum, s) => sum + (s.total_costo ?? 0), 0)
    );
    // Margen = precio_neto_total - costo (excluye IVA, igual que el RPC)
    const netoTotal = round2(
      confirmed.filter(s => s.total_costo !== null)
               .reduce((sum, s) => sum + s.precio_neto_total, 0)
    );
    const margen = round2(netoTotal - costo);
    return { cobrado, costo, margen };
  }, [filtered]);

  async function openDetail(sale: SaleRow) {
    setDetailSale(sale);
    setLoadingItems(true);
    setSaleItems([]);
    setReceivableEstado(null);

    const isCxC = sale.tipo_pago === 'cxc' || sale.tipo_pago === 'cxc_licitaciones';

    const [itemsRes, receivableRes] = await Promise.all([
      supabase.from('sale_items').select('*').eq('sale_id', sale.id).order('created_at'),
      isCxC
        ? supabase.from('receivables').select('estado').eq('sale_id', sale.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setSaleItems((itemsRes.data ?? []) as SaleItem[]);
    setReceivableEstado((receivableRes as any).data?.estado ?? null);
    setLoadingItems(false);
  }

  function startVoid(sale: SaleRow) {
    setDetailSale(null);
    setVoidTarget(sale);
    setVoidStep(1);
    setVoidReason('');
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidSale(voidTarget.id, voidReason);
      toast.success(`Venta ${voidTarget.numero} anulada`);
      setVoidTarget(null);
      setVoidStep(1);
      setVoidReason('');
      await reloadEntries();
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al anular');
    } finally {
      setVoiding(false);
    }
  }

  const detailTotals = useMemo(() => {
    if (!detailSale || saleItems.length === 0) return null;
    // Usar costo_total precalculado por el RPC (correcto para FIFO multi-lote)
    const costo = round2(saleItems.reduce((sum, it) => sum + (it.costo_total ?? 0), 0));
    const margenBruto = round2(detailSale.precio_neto_total - costo);
    const margenBrutoPct = detailSale.precio_neto_total > 0
      ? round2((margenBruto / detailSale.precio_neto_total) * 100)
      : 0;
    // IT ya está calculado y guardado por el RPC al crear la venta
    const it = detailSale.total_it;
    const margenNeto = round2(margenBruto - it);
    const margenNetoPct = detailSale.precio_neto_total > 0
      ? round2((margenNeto / detailSale.precio_neto_total) * 100)
      : 0;
    return { costo, margenBruto, margenBrutoPct, it, margenNeto, margenNetoPct };
  }, [detailSale, saleItems]);

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold flex items-center gap-2">
          <ShoppingCart className="w-6 h-6" /> Ventas
        </h1>
        {canCreate && (
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Venta
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="w-4 h-4" /> Ventas
          </div>
          <div className="text-xl sm:text-2xl font-bold">Bs {fmt(kpis.ventas)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="w-4 h-4" /> Margen bruto
          </div>
          <div className="text-xl sm:text-2xl font-bold">Bs {fmt(kpis.margenBruto)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShoppingCart className="w-4 h-4" /> Transacciones
          </div>
          <div className="text-xl sm:text-2xl font-bold">{kpis.transactions}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Percent className="w-4 h-4" /> Margen promedio
          </div>
          <div className="text-xl sm:text-2xl font-bold">{kpis.margenPct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <PeriodFilterBar value={period} onChange={setPeriod} />
        <Input
          className="max-w-xs"
          placeholder="Buscar por número, cliente, glosa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando ventas...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mb-4 opacity-40" />
          <p>No hay ventas en el período seleccionado.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-center">Factura</TableHead>
                <TableHead className="text-right">Total Cobrado</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
                <TableHead className="text-right">Margen Bruto</TableHead>
                <TableHead className="text-right">% Margen</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => {
                const margen = s.total_costo !== null
                  ? round2(s.precio_neto_total - s.total_costo)
                  : null;
                const margenPct = s.total_costo !== null && s.precio_neto_total > 0
                  ? round2((margen! / s.precio_neto_total) * 100)
                  : null;
                return (
                  <TableRow key={s.id} className={s.estado === 'voided' ? 'opacity-60' : ''}>
                    <TableCell>
                      <button
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={() => openDetail(s)}
                      >
                        {s.numero}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{s.fecha}</TableCell>
                    <TableCell className="text-sm">{s.cliente_nombre || '—'}</TableCell>
                    <TableCell className="text-sm max-w-[180px]">
                      {(() => {
                        const prods = itemsMap[s.id] ?? [];
                        if (prods.length === 0) return <span className="text-muted-foreground">—</span>;
                        const rest = prods.slice(1);
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-[130px]">{prods[0]}</span>
                            {rest.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="text-xs cursor-default shrink-0">
                                      +{rest.length}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[220px]">
                                    <ul className="space-y-0.5 text-xs">
                                      {rest.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">{CANAL_LABELS[s.canal] ?? s.canal}</TableCell>
                    <TableCell className="text-center">
                      {s.con_factura ? <Badge variant="outline">Sí</Badge> : <span className="text-muted-foreground text-xs">No</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">Bs {fmt(s.total_cobrado)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.total_costo !== null ? `Bs ${fmt(s.total_costo)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {margen !== null ? `Bs ${fmt(margen)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {margenPct !== null ? (
                        <Badge variant="outline" className={`text-xs ${margenBadgeClass(margenPct)}`}>
                          {margenPct.toFixed(1)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.estado === 'confirmed' ? (
                        <Badge className="bg-green-600 hover:bg-green-700">Activa</Badge>
                      ) : (
                        <Badge variant="destructive">Anulada</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {/* Totales al pie */}
            <TableFooter>
              <TableRow className="bg-muted/30 font-semibold text-sm">
                <TableCell colSpan={6} className="text-muted-foreground">Totales (confirmadas)</TableCell>
                <TableCell className="text-right">Bs {fmt(tableTotals.cobrado)}</TableCell>
                <TableCell className="text-right text-muted-foreground">Bs {fmt(tableTotals.costo)}</TableCell>
                <TableCell className="text-right">Bs {fmt(tableTotals.margen)}</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <NuevaVentaModal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        onSaved={load}
      />

      {/* Modal detalle de venta */}
      <Dialog open={!!detailSale} onOpenChange={o => !o && setDetailSale(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{detailSale?.numero}</span>
              {detailSale && (
                detailSale.estado === 'confirmed'
                  ? <Badge className="bg-green-600">Activa</Badge>
                  : <Badge variant="destructive">Anulada</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Fecha:</span> {detailSale.fecha}</div>
                <div><span className="text-muted-foreground">Canal:</span> {CANAL_LABELS[detailSale.canal] ?? detailSale.canal}</div>
                <div><span className="text-muted-foreground">Cliente:</span> {detailSale.cliente_nombre || '—'}</div>
                <div><span className="text-muted-foreground">Factura:</span> {detailSale.con_factura ? 'Sí' : 'No'}</div>
                {detailSale.glosa && <div className="col-span-2"><span className="text-muted-foreground">Glosa:</span> {detailSale.glosa}</div>}
              </div>

              {loadingItems ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando ítems...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right w-16">Cant.</TableHead>
                      <TableHead className="text-right w-28">Precio U.</TableHead>
                      <TableHead className="text-right w-28">CPP</TableHead>
                      <TableHead className="text-right w-20">Margen</TableHead>
                      <TableHead className="text-right w-28">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleItems.map(it => {
                      const margenUnit = it.costo_unitario !== null
                        ? round2(it.precio_unitario_neto - it.costo_unitario)
                        : null;
                      const margenPct = margenUnit !== null && it.precio_unitario_neto > 0
                        ? round2((margenUnit / it.precio_unitario_neto) * 100)
                        : null;
                      return (
                        <TableRow key={it.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{it.product_nombre}</div>
                            {it.product_codigo && <div className="text-xs text-muted-foreground font-mono">{it.product_codigo}</div>}
                          </TableCell>
                          <TableCell className="text-right">{it.cantidad}</TableCell>
                          <TableCell className="text-right">Bs {fmt(it.precio_unitario_neto)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {it.costo_unitario !== null ? `Bs ${fmt(it.costo_unitario)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {margenPct !== null ? (
                              <Badge variant="outline" className={`text-xs ${margenBadgeClass(margenPct)}`}>
                                {margenPct.toFixed(1)}%
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">Bs {fmt(it.subtotal_neto)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {detailTotals && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                  {/* Fila 1: Totales de la venta */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    <span className="text-muted-foreground">Total cobrado</span>
                    <span className="text-right font-semibold">Bs {fmt(detailSale.total_cobrado)}</span>
                    <span className="text-muted-foreground">Costo de venta</span>
                    <span className="text-right">Bs {fmt(detailTotals.costo)}</span>
                  </div>

                  <div className="border-t pt-2 grid grid-cols-2 gap-x-8 gap-y-1">
                    {/* Margen bruto */}
                    <span className="text-muted-foreground">Margen bruto</span>
                    <span className="text-right font-semibold flex items-center justify-end gap-1.5">
                      Bs {fmt(detailTotals.margenBruto)}
                      <Badge variant="outline" className={`text-xs ${margenBadgeClass(detailTotals.margenBrutoPct)}`}>
                        {detailTotals.margenBrutoPct.toFixed(1)}%
                      </Badge>
                    </span>
                    {/* IT */}
                    <span className="text-muted-foreground">IT (3%)</span>
                    <span className="text-right text-red-600">− Bs {fmt(detailTotals.it)}</span>
                    {/* Margen neto */}
                    <span className="font-medium">Margen neto</span>
                    <span className="text-right font-bold flex items-center justify-end gap-1.5">
                      Bs {fmt(detailTotals.margenNeto)}
                      <Badge variant="outline" className={`text-xs ${margenBadgeClass(detailTotals.margenNetoPct)}`}>
                        {detailTotals.margenNetoPct.toFixed(1)}%
                      </Badge>
                    </span>
                  </div>

                  {/* Estado de cobro */}
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Estado de cobro</span>
                    {(() => {
                      const isCxC = detailSale.tipo_pago === 'cxc' || detailSale.tipo_pago === 'cxc_licitaciones';
                      if (!isCxC) {
                        return <Badge className="bg-green-600 hover:bg-green-700 text-white">Cobrada</Badge>;
                      }
                      switch (receivableEstado) {
                        case 'paid':    return <Badge className="bg-green-600 hover:bg-green-700 text-white">Cobrada</Badge>;
                        case 'partial': return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Cobro parcial</Badge>;
                        case 'open':    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Pendiente</Badge>;
                        case 'voided':  return <Badge variant="destructive">Anulada</Badge>;
                        default:        return <span className="text-muted-foreground text-xs">—</span>;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {detailSale && canEdit && detailSale.estado === 'confirmed' && (
            <DialogFooter>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => startVoid(detailSale)}
              >
                <Ban className="w-4 h-4 mr-1.5" /> Anular venta
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Void step 1 */}
      <AlertDialog
        open={!!voidTarget && voidStep === 1}
        onOpenChange={o => { if (!o) { setVoidTarget(null); setVoidStep(1); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular venta {voidTarget?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará un asiento de reversión y el stock será restaurado. Indica el motivo de la anulación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Motivo de la anulación..."
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); if (voidReason.trim()) setVoidStep(2); }}
              disabled={!voidReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void step 2 */}
      <AlertDialog
        open={!!voidTarget && voidStep === 2}
        onOpenChange={o => { if (!o) { setVoidTarget(null); setVoidStep(1); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción generará un asiento de reversión irrevocable para la venta {voidTarget?.numero}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setVoidTarget(null); setVoidStep(1); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoid}
              disabled={voiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {voiding ? 'Anulando...' : 'Confirmar anulación'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
