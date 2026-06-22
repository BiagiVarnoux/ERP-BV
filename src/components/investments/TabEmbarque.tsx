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
import { Shipment, ShipmentProduct, SHIPMENT_STATUS_LABELS } from '@/accounting/shipment-types';
import { fmt } from '@/accounting/utils';
import { StatCard } from './ui-helpers';

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
  embarqueId?: string;
  onEmbarqueId: (id: string | undefined) => void;
  onUpdateItem: (id: string, changes: Partial<InvestmentItem>) => void;
}

function prodLabel(p: ShipmentProduct): string {
  const extra = [p.especificacion, p.condicion].filter(Boolean).join(' · ');
  return `${p.nombre.trim()}${extra ? ` — ${extra}` : ''}`;
}

export function TabEmbarque({ items, calcs, embarqueId, onEmbarqueId, onUpdateItem }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ShipmentStorage.load()
      .then(setShipments)
      .catch(e => { toast.error('Error cargando embarques'); console.error(e); })
      .finally(() => setLoading(false));
  }, []);

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
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
