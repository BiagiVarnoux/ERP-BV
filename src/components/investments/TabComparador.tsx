// src/components/investments/TabComparador.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { InvestmentItem, ItemCalc } from '@/accounting/investment-types';
import { fmt } from '@/accounting/utils';

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
}

type RowDef = {
  label: string;
  get: (c: ItemCalc) => number;
  // 'high' = mayor es mejor, 'low' = menor es mejor, undefined = no resaltar
  best?: 'high' | 'low';
  format: (v: number) => string;
};

const pct = (v: number) => isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
const bs = (v: number) => isFinite(v) ? `Bs ${fmt(v)}` : '—';
const mes = (v: number) => isFinite(v) ? `${fmt(v)} m` : '—';
const uds = (v: number) => isFinite(v) ? `${fmt(v)} uds` : '—';

const ROWS: RowDef[] = [
  { label: 'Inversión',        get: c => c.costeo.inversion,          best: 'low',  format: bs },
  { label: 'Ganancia',         get: c => c.costeo.ganancia,           best: 'high', format: bs },
  { label: 'ROI simple',       get: c => c.costeo.roi,                best: 'high', format: pct },
  { label: 'Ciclo de caja',    get: c => c.tiempo.ciclo_meses,        best: 'low',  format: mes },
  { label: 'ROI anual. realista', get: c => c.tiempo.roi_anualizado_realista, best: 'high', format: pct },
  { label: 'ROI anual. teórico',  get: c => c.tiempo.roi_anualizado,          best: 'high', format: pct },
  { label: 'TIR anual',        get: c => c.tiempo.tir_anual,          best: 'high', format: pct },
  { label: 'VAN',              get: c => c.tiempo.van,                best: 'high', format: bs },
  { label: 'Punto equilibrio', get: c => c.tiempo.punto_equilibrio_uds, best: 'low', format: uds },
  { label: 'Recuperación',     get: c => c.tiempo.meses_recuperacion, best: 'low',  format: mes },
];

export function TabComparador({ items, calcs }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-lg">
        Agrega productos en la pestaña "Productos &amp; Costeo" para compararlos.
      </div>
    );
  }

  // Índice del mejor por fila
  const bestIdx = ROWS.map(row => {
    if (!row.best) return -1;
    let idx = -1, bestVal = row.best === 'high' ? -Infinity : Infinity;
    calcs.forEach((c, i) => {
      const v = row.get(c);
      if (!isFinite(v)) return;
      if (row.best === 'high' ? v > bestVal : v < bestVal) { bestVal = v; idx = i; }
    });
    return idx;
  });

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Comparación de productos — el mejor de cada métrica resaltado en verde
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground sticky left-0 bg-background">Métrica</th>
                {items.map((it, i) => (
                  <th key={it.id} className="text-right px-3 py-2 font-medium min-w-[120px]">
                    {it.nombre || `Producto ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground sticky left-0 bg-background">{row.label}</td>
                  {calcs.map((c, ci) => {
                    const v = row.get(c);
                    const isBest = bestIdx[ri] === ci && items.length > 1;
                    return (
                      <td
                        key={ci}
                        className={`text-right px-3 py-2 font-mono ${isBest ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-semibold rounded' : ''}`}
                      >
                        {row.format(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
