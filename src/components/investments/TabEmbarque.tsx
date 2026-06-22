// src/components/investments/TabEmbarque.tsx
// Conciliación análisis ↔ embarque (Fase 1): vincular un embarque, mapear cada
// producto del análisis a una o varias filas del embarque, y comparar costo
// estimado (análisis) vs costo real (embarque cerrado).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Ship, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InvestmentItem, ItemCalc } from '@/accounting/investment-types';
import { ShipmentStorage } from '@/accounting/shipment-storage';
import { InvestmentStorage, RealizedData, RealizedProduct } from '@/accounting/investment-storage';
import { Shipment, ShipmentProduct, SHIPMENT_STATUS_LABELS } from '@/accounting/shipment-types';
import { fmt } from '@/accounting/utils';
import { StatCard, Pct } from './ui-helpers';

// Normaliza para emparejar nombres (trim, minúsculas, espacios colapsados).
function norm(s?: string | null): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Empareja una fila del embarque a un producto del catálogo por nombre, afinando
// con especificación y condición cuando hay varios candidatos.
function matchProduct(sp: ShipmentProduct, products: RealizedProduct[]): RealizedProduct | null {
  const n = norm(sp.nombre);
  let cands = products.filter(p => norm(p.nombre) === n);
  if (cands.length === 0) {
    cands = products.filter(p => {
      const pn = norm(p.nombre);
      return pn.length > 2 && (pn.includes(n) || n.includes(pn));
    });
  }
  if (cands.length > 1 && sp.especificacion) {
    const e = norm(sp.especificacion);
    const nar = cands.filter(p => norm(p.especificacion) === e);
    if (nar.length) cands = nar;
  }
  if (cands.length > 1 && sp.condicion) {
    const c = norm(sp.condicion);
    const nar = cands.filter(p => norm(p.condicion) === c);
    if (nar.length) cands = nar;
  }
  return cands[0] ?? null;
}

function daysBetween(a: string, b: string): number | null {
  const da = Date.parse(a), db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return null;
  return Math.max(0, Math.round((db - da) / 86400000));
}

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
  companyId?: string;
  embarqueId?: string;
  onEmbarqueId: (id: string | undefined) => void;
  onUpdateItem: (id: string, changes: Partial<InvestmentItem>) => void;
}

function prodLabel(p: ShipmentProduct): string {
  const extra = [p.especificacion, p.condicion].filter(Boolean).join(' · ');
  return `${p.nombre.trim()}${extra ? ` — ${extra}` : ''}`;
}

export function TabEmbarque({ items, calcs, companyId, embarqueId, onEmbarqueId, onUpdateItem }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [realized, setRealized] = useState<RealizedData | null>(null);

  useEffect(() => {
    setLoading(true);
    ShipmentStorage.load()
      .then(setShipments)
      .catch(e => { toast.error('Error cargando embarques'); console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    InvestmentStorage.fetchRealizedData(companyId)
      .then(setRealized)
      .catch(e => { console.error('Error cargando ventas reales', e); });
  }, [companyId]);

  const shipment = useMemo(
    () => shipments.find(s => s.id === embarqueId),
    [shipments, embarqueId],
  );
  const isCerrado = shipment?.status === 'CERRADO';

  // Producto del embarque por id (para la conciliación)
  const prodById = useMemo(() => {
    const m = new Map<string, ShipmentProduct>();
    shipment?.products.forEach(p => m.set(p.id, p));
    return m;
  }, [shipment]);

  const toggleMap = useCallback((item: InvestmentItem, productId: string) => {
    const cur = item.mapped_shipment_product_ids ?? [];
    const next = cur.includes(productId)
      ? cur.filter(id => id !== productId)
      : [...cur, productId];
    onUpdateItem(item.id, { mapped_shipment_product_ids: next });
  }, [onUpdateItem]);

  // ── Resultado real por producto del análisis (Fase 2) ─────────────────────
  // Resuelve productos del catálogo (por nombre+espec+condición) desde las filas
  // del embarque mapeadas, y agrega las ventas confirmadas.
  const realizedByItem = useMemo(() => {
    const out: Record<string, {
      unidades: number; precioReal: number; margen: number; roiReal: number;
      conF: number; sinF: number; ultima: string; diasVenta: number | null;
      matched: string[];
    }> = {};
    // Solo hay ventas atribuibles cuando el embarque está CERRADO (sus productos
    // entraron a inventario). Antes de eso, cualquier venta de un producto del
    // mismo nombre pertenece a OTRO embarque, no a este.
    if (!shipment || !realized || !isCerrado) return out;

    for (const it of items) {
      const mappedProds = (it.mapped_shipment_product_ids ?? [])
        .map(id => prodById.get(id))
        .filter((p): p is ShipmentProduct => !!p);

      const pids = new Set<string>();
      const matched: string[] = [];
      for (const sp of mappedProds) {
        const m = matchProduct(sp, realized.products);
        if (m && !pids.has(m.id)) { pids.add(m.id); matched.push(m.nombre.trim()); }
      }

      let unidades = 0, ingreso = 0, costo = 0, margen = 0, conF = 0, sinF = 0;
      let ultima = '', ingresoDate = '';
      for (const pid of pids) {
        const a = realized.byProduct[pid];
        if (a) {
          unidades += a.unidades; ingreso += a.ingreso_neto; costo += a.costo; margen += a.margen;
          conF += a.con_factura; sinF += a.sin_factura;
          if (a.ultima_venta && (!ultima || a.ultima_venta > ultima)) ultima = a.ultima_venta;
        }
        const ing = realized.ingresoByProduct[pid];
        if (ing && (!ingresoDate || ing < ingresoDate)) ingresoDate = ing;
      }
      out[it.id] = {
        unidades,
        precioReal: unidades > 0 ? ingreso / unidades : 0,
        margen,
        roiReal: costo > 0 ? margen / costo : 0,
        conF, sinF, ultima,
        diasVenta: ingresoDate && ultima ? daysBetween(ingresoDate, ultima) : null,
        matched,
      };
    }
    return out;
  }, [items, shipment, realized, prodById, isCerrado]);

  const hayVentas = Object.values(realizedByItem).some(r => r.unidades > 0);

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Vincular embarque */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" /> Embarque vinculado
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={embarqueId ?? '__none__'}
                onValueChange={v => onEmbarqueId(v === '__none__' ? undefined : v)}
                disabled={loading}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder={loading ? 'Cargando...' : 'Seleccionar embarque'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin vincular</SelectItem>
                  {shipments.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.numero} · {SHIPMENT_STATUS_LABELS[s.status]} · {s.products.length} prod.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shipment && (
                <Badge variant="outline" className="gap-1">
                  <Ship className="h-3 w-3" /> {shipment.numero}
                </Badge>
              )}
              {shipment && !isCerrado && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> El costo real estará disponible al cerrar el embarque.
                </span>
              )}
              {isCerrado && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Embarque cerrado — costo real disponible.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {!shipment ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg">
            Vincula un embarque para mapear los productos y comparar costo estimado vs real.
          </div>
        ) : (
          <>
            {/* Mapeo por producto */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Mapeo de productos — marca qué filas del embarque corresponden a cada producto del análisis
                </p>
                <div className="space-y-3">
                  {items.map(it => {
                    const mapped = it.mapped_shipment_product_ids ?? [];
                    return (
                      <div key={it.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <span className="font-medium text-sm">
                            {it.nombre || 'Sin nombre'}
                            {it.especificacion && <span className="text-muted-foreground"> · {it.especificacion}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">Plan: {it.cantidad} uds</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {shipment.products.map(p => {
                            const checked = mapped.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleMap(it, p.id)}
                                className={`text-xs px-2.5 py-1.5 rounded border transition-colors text-left ${
                                  checked
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : 'border-border text-muted-foreground hover:bg-muted/50'
                                }`}
                              >
                                {prodLabel(p)} <span className="opacity-60">×{p.cantidad}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Conciliación: plan vs real */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Conciliación — planeado vs real
                </p>
                <div className="overflow-x-auto">
                  <table className="text-sm w-full">
                    <thead>
                      <tr className="text-muted-foreground border-b text-xs">
                        <th className="text-left py-2 pr-3 font-medium">Producto</th>
                        <th className="text-right px-2 font-medium">Cant. plan</th>
                        <th className="text-right px-2 font-medium">Cant. real</th>
                        <th className="text-right px-2 font-medium">Costo est.</th>
                        <th className="text-right px-2 font-medium">Costo real</th>
                        <th className="text-right px-2 font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const mapped = (it.mapped_shipment_product_ids ?? [])
                          .map(id => prodById.get(id))
                          .filter((p): p is ShipmentProduct => !!p);
                        const realQty = mapped.reduce((s, p) => s + (p.cantidad || 0), 0);
                        const costoEst = calcs[i].costeo.costo_unitario;

                        // Costo real unitario = promedio ponderado de costo_total_unitario (solo si cerrado)
                        let costoReal: number | null = null;
                        if (isCerrado && mapped.length > 0) {
                          let num = 0, den = 0;
                          for (const p of mapped) {
                            if (p.costo_total_unitario != null) {
                              num += p.costo_total_unitario * (p.cantidad || 0);
                              den += (p.cantidad || 0);
                            }
                          }
                          costoReal = den > 0 ? num / den : null;
                        }
                        const delta = costoReal != null && costoEst > 0
                          ? (costoReal - costoEst) / costoEst
                          : null;
                        const deltaColor = delta == null ? '' : delta > 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400';

                        return (
                          <tr key={it.id} className="border-b last:border-0">
                            <td className="py-2 pr-3">{it.nombre || `Producto ${i + 1}`}</td>
                            <td className="text-right px-2 font-mono">{it.cantidad}</td>
                            <td className={`text-right px-2 font-mono ${realQty !== it.cantidad ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                              {mapped.length === 0 ? '—' : realQty}
                            </td>
                            <td className="text-right px-2 font-mono">Bs {fmt(costoEst)}</td>
                            <td className="text-right px-2 font-mono">
                              {costoReal != null ? `Bs ${fmt(costoReal)}` : <span className="text-muted-foreground">pendiente</span>}
                            </td>
                            <td className={`text-right px-2 font-mono font-semibold ${deltaColor}`}>
                              {delta != null ? `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                  <StatCard
                    label="Inversión estimada"
                    value={calcs.reduce((s, c) => s + c.costeo.inversion, 0)}
                    bold
                    hint="Capital comprometido según el análisis"
                  />
                  <StatCard
                    label="Unidades mapeadas"
                    value={items.reduce((s, it) => s + (it.mapped_shipment_product_ids?.length ? 1 : 0), 0)}
                    suffix={` / ${items.length} prod.`}
                    hint="Productos del análisis con al menos una fila del embarque mapeada"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Resultado real (ventas) — Fase 2 */}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Resultado real — ventas (planeado vs realizado)
                </p>
                {!isCerrado ? (
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    El embarque vinculado aún no está cerrado, así que sus productos todavía no entraron a inventario.
                    Las ventas reales aparecerán cuando cierres el embarque. (Las ventas de productos del mismo nombre
                    en otros embarques no se cuentan aquí.)
                  </p>
                ) : !realized ? (
                  <p className="text-sm text-muted-foreground">Cargando ventas...</p>
                ) : !hayVentas ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no hay ventas registradas para los productos mapeados. Aparecerán aquí a medida que vendas.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="text-sm w-full">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="text-left py-2 pr-3 font-medium">Producto</th>
                          <th className="text-right px-2 font-medium">Precio venta plan</th>
                          <th className="text-right px-2 font-medium">Precio venta real</th>
                          <th className="text-right px-2 font-medium">Vendidas</th>
                          <th className="text-right px-2 font-medium">ROI plan</th>
                          <th className="text-right px-2 font-medium">ROI real</th>
                          <th className="text-right px-2 font-medium">Días en vender</th>
                          <th className="text-center px-2 font-medium">c/f · s/f</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, i) => {
                          const r = realizedByItem[it.id];
                          const planPrecio = it.modalidad_venta === 'sin_factura'
                            ? it.precio_venta_sin_factura : it.precio_venta;
                          const planRoi = calcs[i].costeo.roi;
                          const sold = r && r.unidades > 0;
                          const precioColor = sold && r.precioReal >= planPrecio
                            ? 'text-green-600 dark:text-green-400' : sold ? 'text-amber-600 dark:text-amber-400' : '';
                          const roiColor = sold && r.roiReal >= planRoi
                            ? 'text-green-600 dark:text-green-400' : sold ? 'text-red-500' : '';
                          return (
                            <tr key={it.id} className="border-b last:border-0">
                              <td className="py-2 pr-3">
                                {it.nombre || `Producto ${i + 1}`}
                                {r && r.matched.length > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">↳ {r.matched.join(', ')}</span>
                                )}
                              </td>
                              <td className="text-right px-2 font-mono">Bs {fmt(planPrecio)}</td>
                              <td className={`text-right px-2 font-mono ${precioColor}`}>
                                {sold ? `Bs ${fmt(r.precioReal)}` : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="text-right px-2 font-mono">{sold ? `${fmt(r.unidades)} / ${it.cantidad}` : '—'}</td>
                              <td className="text-right px-2 font-mono"><Pct v={planRoi} /></td>
                              <td className={`text-right px-2 font-mono font-semibold ${roiColor}`}>
                                {sold ? <Pct v={r.roiReal} /> : '—'}
                              </td>
                              <td className="text-right px-2 font-mono">{r?.diasVenta != null ? `${r.diasVenta} d` : '—'}</td>
                              <td className="text-center px-2 font-mono text-xs">
                                {sold ? `${fmt(r.conF)} · ${fmt(r.sinF)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground mt-3">
                      Cifras <strong>a nivel de producto</strong>: bajo costo promedio (CPP) el inventario es un pool,
                      así que las ventas no se pueden separar por embarque. Incluyen todas las ventas del producto
                      emparejado (por nombre + especificación + condición, mostrado bajo cada ítem), no solo las de
                      este embarque. "Días en vender" = desde el ingreso a inventario hasta la última venta.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
