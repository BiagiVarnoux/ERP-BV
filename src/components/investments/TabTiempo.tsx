// src/components/investments/TabTiempo.tsx
import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Clock, TrendingUp, Wallet, Percent } from 'lucide-react';
import { InvestmentItem, ItemCalc, InvestmentResumen } from '@/accounting/investment-types';
import { fmt, toDecimal } from '@/accounting/utils';
import { Pct, StatCard } from './ui-helpers';

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
  resumen: InvestmentResumen;
  costoCapital: number;
  plazoImport: number;
  fuc: number;
  onCostoCapital: (v: number) => void;
  onPlazoImport: (v: number) => void;
  onFuc: (v: number) => void;
  onUpdateItem: (id: string, changes: Partial<InvestmentItem>) => void;
}

export function TabTiempo({
  items, calcs, resumen, costoCapital, plazoImport, fuc, onCostoCapital, onPlazoImport, onFuc, onUpdateItem,
}: Props) {
  // Flujo agregado para la tabla mes a mes.
  const flujoAgregado = useMemo(() => {
    const maxLen = Math.max(1, ...calcs.map(c => c.tiempo.flujos.length));
    const agg = new Array(maxLen).fill(0);
    calcs.forEach(c => c.tiempo.flujos.forEach((f, t) => { agg[t] += f; }));
    return agg;
  }, [calcs]);

  const acumulado = useMemo(() => {
    let run = 0;
    return flujoAgregado.map(f => (run += f));
  }, [flujoAgregado]);

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Parámetros del análisis */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Parámetros financieros
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Costo de capital (% anual)</label>
                <Input
                  type="number" step="0.5" min="0"
                  className="h-8"
                  value={costoCapital}
                  onChange={e => onCostoCapital(toDecimal(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">Tasa de descuento para el VAN/TIR.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Plazo de importación (meses)</label>
                <Input
                  type="number" step="0.5" min="0"
                  className="h-8"
                  value={plazoImport}
                  onChange={e => onPlazoImport(toDecimal(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">Desde el pago hasta tenerlo en almacén.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Factor de Utilización de Capital (%)</label>
                <Input
                  type="number" step="5" min="1" max="100"
                  className="h-8"
                  value={fuc}
                  onChange={e => onFuc(toDecimal(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">Tiempo activo / total. 100% = sin tiempo muerto.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Métricas globales temporales */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" /> Rentabilidad ajustada por tiempo
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatCard label="Inversión" value={resumen.inversion} bold hint="Capital comprometido al inicio" />
              <StatCard label="Ganancia" value={resumen.ganancia} bold color={resumen.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
              <StatCard label="ROI simple" value={resumen.roi} isPct hint="Ganancia / Inversión (sin tiempo)" />
              <StatCard label="Ciclo de caja" value={resumen.ciclo_meses} suffix=" m" hint="Plazo importación + plazo de venta (ponderado)" />
              <StatCard label="ROI anual. realista" value={resumen.roi_anualizado_realista} isPct bold hint={`Con FUC ${fuc}%: descuenta el tiempo muerto entre ciclos. El número en el que confiar.`} color={resumen.roi_anualizado_realista < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
              <StatCard label="ROI anual. teórico" value={resumen.roi_anualizado} isPct hint="Reinversión continua sin fricción (techo ideal, casi nunca alcanzable)" />
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatCard label="TIR anual" value={resumen.tir_anual} isPct bold hint="Tasa interna de retorno del flujo de caja" color={resumen.tir_anual < (costoCapital / 100) ? 'text-amber-500' : 'text-green-600 dark:text-green-400'} />
            </div>
            <div className="mt-3 flex items-center gap-2 pt-3 border-t flex-wrap">
              <span className="text-xs text-muted-foreground">VAN (a {costoCapital}% anual):</span>
              <span className={`text-base font-bold font-mono ${resumen.van < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                Bs {fmt(resumen.van)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {resumen.van >= 0
                  ? '✓ El proyecto crea valor sobre tu costo de capital.'
                  : '✗ El retorno no supera tu costo de capital.'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Por producto */}
        {items.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Por producto
              </p>
              <div className="space-y-2">
                {items.map((it, i) => {
                  const t = calcs[i].tiempo;
                  return (
                    <div key={it.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <span className="font-medium text-sm">{it.nombre || `Producto ${i + 1}`}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" /> ciclo {fmt(t.ciclo_meses)} m
                          </span>
                          <span className="flex items-center gap-1">
                            <Percent className="h-3 w-3" /> anualiz. realista <span className={t.roi_anualizado_realista < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}><Pct v={t.roi_anualizado_realista} /></span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3 w-3" /> VAN <span className={t.van < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}>Bs {fmt(t.van)}</span>
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <StatCard label="Plazo venta" value={t.meses_venta} suffix=" m" hint="Tiempo en vender todo el lote" />
                        <StatCard label="ROI anual. realista" value={t.roi_anualizado_realista} isPct hint={`Con FUC ${fuc}% — descuenta tiempo muerto`} />
                        <StatCard label="ROI anual. teórico" value={t.roi_anualizado} isPct hint="Reinversión sin fricción (techo ideal)" />
                        <StatCard label="Punto equil." value={t.punto_equilibrio_uds} suffix=" uds" hint="Unidades para recuperar la inversión" />
                        <StatCard label="Recuperación" value={t.meses_recuperacion} suffix=" m" hint="Mes en que el flujo acumulado vuelve a 0" />
                        <StatCard label="TIR anual" value={t.tir_anual} isPct />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flujo de caja mensual agregado */}
        {flujoAgregado.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Flujo de caja mensual (agregado)
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-1.5 pr-3 font-medium">Mes</th>
                      {flujoAgregado.map((_, t) => (
                        <th key={t} className="text-right px-2 py-1.5 font-medium">{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 pr-3 text-muted-foreground">Flujo</td>
                      {flujoAgregado.map((f, t) => (
                        <td key={t} className={`text-right px-2 py-1.5 font-mono ${f < 0 ? 'text-red-500' : f > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                          {fmt(f)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 text-muted-foreground">Acumulado</td>
                      {acumulado.map((f, t) => (
                        <td key={t} className={`text-right px-2 py-1.5 font-mono ${f < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                          {fmt(f)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
