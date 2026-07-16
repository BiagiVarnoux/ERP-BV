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
import { InvestmentItem, ItemCalc, InvestmentAnalysis } from '@/accounting/investment-types';
import { ShipmentStorage } from '@/accounting/shipment-storage';
import { InvestmentStorage, ShipmentRealizedRow, ShipmentRealizedDetailRow } from '@/accounting/investment-storage';
import { Shipment, ShipmentProduct, SHIPMENT_STATUS_LABELS } from '@/accounting/shipment-types';
import { calcResultadoReal, calcResumenReal, ItemResultadoReal } from '@/accounting/investment-utils';
import { fmt, round2 } from '@/accounting/utils';
import { StatCard, Pct } from './ui-helpers';

function daysBetween(a: string, b: string): number | null {
  const da = Date.parse(a), db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return null;
  return Math.max(0, Math.round((db - da) / 86400000));
}

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
  companyId?: string;
  costoCapitalAnual: number;
  embarqueId?: string;
  onEmbarqueId: (id: string | undefined) => void;
  onUpdateItem: (id: string, changes: Partial<InvestmentItem>) => void;
}

function prodLabel(p: ShipmentProduct): string {
  const extra = [p.especificacion, p.condicion].filter(Boolean).join(' · ');
  return `${p.nombre.trim()}${extra ? ` — ${extra}` : ''}`;
}

export function TabEmbarque({ items, calcs, companyId, costoCapitalAnual, embarqueId, onEmbarqueId, onUpdateItem }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  // Ventas reales atribuidas a este embarque, indexadas por shipment_product_id.
  const [realized, setRealized] = useState<Record<string, ShipmentRealizedRow>>({});
  // Detalle por fecha de esas mismas ventas, para el flujo de caja real (VAN/TIR).
  const [realizedDetail, setRealizedDetail] = useState<ShipmentRealizedDetailRow[]>([]);

  useEffect(() => {
    setLoading(true);
    ShipmentStorage.load()
      .then(setShipments)
      .catch(e => { toast.error('Error cargando embarques'); console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId || !embarqueId) { setRealized({}); setRealizedDetail([]); return; }
    InvestmentStorage.fetchShipmentRealized(companyId, embarqueId)
      .then(setRealized)
      .catch(e => { console.error('Error cargando ventas reales', e); setRealized({}); });
    InvestmentStorage.fetchShipmentRealizedDetail(companyId, embarqueId)
      .then(setRealizedDetail)
      .catch(e => { console.error('Error cargando detalle de ventas reales', e); setRealizedDetail([]); });
  }, [companyId, embarqueId]);

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

  // ── Resultado real por producto del análisis (Fase 3) ─────────────────────
  // Cadena exacta: cada ítem suma las ventas atribuidas a sus filas del embarque
  // mapeadas (shipment_product_id), provenientes del RPC. Solo cuenta las ventas
  // que consumieron lotes de ESTE embarque — nada de fuzzy match por nombre.
  const realizedByItem = useMemo(() => {
    const out: Record<string, {
      unidades: number; precioReal: number; margen: number; roiReal: number;
      conF: number; sinF: number; ultima: string; diasVenta: number | null;
    }> = {};
    if (!shipment || !isCerrado) return out;

    for (const it of items) {
      let unidades = 0, ingreso = 0, costo = 0, conF = 0, sinF = 0;
      let ultima = '', primera = '';
      for (const spid of it.mapped_shipment_product_ids ?? []) {
        const r = realized[spid];
        if (!r) continue;
        unidades += r.unidades; ingreso += r.ingreso_neto; costo += r.costo;
        conF += r.con_factura; sinF += r.sin_factura;
        if (r.ultima_venta && (!ultima || r.ultima_venta > ultima)) ultima = r.ultima_venta;
        if (r.primera_entrada && (!primera || r.primera_entrada < primera)) primera = r.primera_entrada;
      }
      const margen = round2(ingreso - costo);
      out[it.id] = {
        unidades,
        precioReal: unidades > 0 ? ingreso / unidades : 0,
        margen,
        roiReal: costo > 0 ? margen / costo : 0,
        conF, sinF, ultima,
        diasVenta: primera && ultima ? daysBetween(primera, ultima) : null,
      };
    }
    return out;
  }, [items, shipment, realized, isCerrado]);

  const hayVentas = Object.values(realizedByItem).some(r => r.unidades > 0);

  // ── Resultado real completo por ítem (costo real + venta real/proyectada) ──
  // A diferencia de realizedByItem (solo ROI de lo ya vendido), esto también
  // calcula ganancia/ROI/VAN/TIR reales proyectando lo aún no vendido al
  // precio y velocidad cotizados — para aislar el efecto del costo real.
  const resultadosReales = useMemo((): (ItemResultadoReal | null)[] => {
    if (!shipment || !isCerrado) return items.map(() => null);
    return items.map((it, i) => {
      const mapped = (it.mapped_shipment_product_ids ?? [])
        .map(id => prodById.get(id))
        .filter((p): p is ShipmentProduct => !!p);
      const detalle = realizedDetail.filter(d => mapped.some(p => p.id === d.shipment_product_id));
      return calcResultadoReal(it, calcs[i].costeo, mapped, detalle, costoCapitalAnual);
    });
  }, [items, calcs, shipment, isCerrado, prodById, realizedDetail, costoCapitalAnual]);

  const resumenReal = useMemo(
    () => calcResumenReal(costoCapitalAnual, calcs, resultadosReales),
    [costoCapitalAnual, calcs, resultadosReales],
  );

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
                        <th className="text-right px-2 font-medium" title="Costo contable estimado, sin IVA aduana">Costo est. (s/IVA)</th>
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
                        // Costo estimado SIN IVA: el embarque capitaliza el inventario sin IVA aduana
                        // (crédito fiscal), así que la comparación contra el COGS real debe ser sin IVA.
                        const costoEst = calcs[i].costeo.costo_unitario_sin_iva;

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

            {/* Resumen real vs cotizado — impacto total en ganancia, ROI, VAN y TIR */}
            {isCerrado && resumenReal.itemsConCostoReal > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Resumen real vs cotizado
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {resumenReal.itemsConCostoReal} de {resumenReal.itemsTotal} producto{resumenReal.itemsTotal !== 1 ? 's' : ''} con costo real disponible.
                    Lo aún no vendido se proyecta al precio y velocidad cotizados, para aislar el efecto del costo real.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-sm w-full">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="text-left py-2 pr-3 font-medium">Métrica</th>
                          <th className="text-right px-2 font-medium">Cotizado</th>
                          <th className="text-right px-2 font-medium">Real</th>
                          <th className="text-right px-2 font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ResumenRealRow
                          label="Inversión"
                          est={resumenReal.inversionEstimada}
                          real={resumenReal.inversionReal}
                          invertColor
                        />
                        <ResumenRealRow
                          label="Ganancia"
                          est={resumenReal.gananciaEstimada}
                          real={resumenReal.gananciaReal}
                        />
                        <ResumenRealRow
                          label="ROI"
                          est={resumenReal.roiEstimado}
                          real={resumenReal.roiReal}
                          isPct
                        />
                        <ResumenRealRow
                          label="VAN"
                          est={resumenReal.vanEstimado}
                          real={resumenReal.vanReal}
                        />
                        <ResumenRealRow
                          label="TIR anual"
                          est={resumenReal.tirEstimadoAnual}
                          real={resumenReal.tirRealAnual}
                          isPct
                        />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

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
                    Las ventas reales aparecerán cuando cierres el embarque.
                  </p>
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
                      Cifras <strong>atribuidas exactamente a este embarque</strong> (trazabilidad FIFO por lote):
                      solo cuentan las ventas que consumieron stock de las filas mapeadas, no las de otros embarques
                      del mismo producto. El COGS es el costo real del lote. "Días en vender" = desde el ingreso a
                      inventario hasta la última venta.
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

// ─── Fila del resumen real vs cotizado ─────────────────────────────────────

function ResumenRealRow({ label, est, real, isPct, invertColor }: {
  label: string; est: number; real: number; isPct?: boolean; invertColor?: boolean;
}) {
  const delta = est !== 0 ? (real - est) / Math.abs(est) : (real !== 0 ? (real > 0 ? 1 : -1) : 0);
  const mejora = invertColor ? real <= est : real >= est;
  const deltaColor = real === est ? '' : mejora ? 'text-green-600 dark:text-green-400' : 'text-red-500';
  const fmtVal = (v: number) => isPct ? <Pct v={v} /> : `Bs ${fmt(v)}`;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-medium">{label}</td>
      <td className="text-right px-2 font-mono">{fmtVal(est)}</td>
      <td className="text-right px-2 font-mono font-semibold">{fmtVal(real)}</td>
      <td className={`text-right px-2 font-mono font-semibold ${deltaColor}`}>
        {`${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}
      </td>
    </tr>
  );
}
