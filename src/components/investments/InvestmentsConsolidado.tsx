// src/components/investments/InvestmentsConsolidado.tsx
// Vista consolidada de varios análisis de inversión seleccionados: combina
// inversión, ingreso, costos, ganancia, ROI, impuestos y — a diferencia de
// simplemente sumar campos — recombina los flujos de caja de todos los
// ítems para obtener un VAN y una TIR de portafolio realmente correctos.
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  InvestmentAnalysis, INVESTMENT_ESTADO_LABELS, INVESTMENT_ESTADO_COLORS,
} from '@/accounting/investment-types';
import { calcItem, calcResumen, consolidarAnalisis } from '@/accounting/investment-utils';
import { fmt } from '@/accounting/utils';

interface Props {
  analyses: InvestmentAnalysis[];
  onClose: () => void;
}

export function InvestmentsConsolidado({ analyses, onClose }: Props) {
  const total = consolidarAnalisis(analyses);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consolidado — {analyses.length} análisis</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Totales combinados */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Totales combinados
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Item label="Inversión" value={total.inversion} />
              <Item label="Ingreso total" value={total.ingreso_total} />
              <Item label="IVA a pagar" value={total.iva_pagar} />
              <Item label="IT a pagar" value={total.it_pagar} />
              <Item label="Costos totales" value={total.costos} bold />
              <Item
                label="Ganancia"
                value={total.ganancia}
                bold
                color={total.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
              />
            </div>

            <div className="pt-2 border-t">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Desglose de costos
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Item label="Precio total (USD)" value={total.total_usd} unit="USD" />
                <Item label="Compra (Bs)" value={total.total_precio_bs} />
                <Item label="Envío" value={total.total_envio} />
                <Item label="GA (gravamen)" value={total.ga_total} />
                <Item label="IVA aduana" value={total.iva_aduana_total} />
                <Item label="Manipuleo" value={total.total_manipuleo} />
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Rentabilidad temporal del portafolio combinado
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Item label="Ciclo (meses, ponderado)" value={total.ciclo_meses} unit="" />
                <Item label="VAN combinado" value={total.van} />
                <PctItem label="TIR anual combinada" value={total.tir_anual} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                VAN y TIR se calculan combinando los flujos de caja reales de todos los productos de
                todos los análisis seleccionados — no son un promedio de los TIR individuales.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">ROI combinado:</span>
              <span className={`text-base font-bold font-mono ${total.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                {(total.roi * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Desglose por análisis */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Por análisis
            </p>
            {analyses.map(a => {
              const calcs = a.items.map(it => calcItem(it, a.plazo_importacion_meses, a.costo_capital_anual, a.fuc_pct, a.tc_oficial));
              const r = calcResumen(a, calcs);
              return (
                <div key={a.id} className="rounded border p-3 flex items-center gap-3">
                  <Badge className={`shrink-0 text-xs ${INVESTMENT_ESTADO_COLORS[a.estado]}`}>
                    {INVESTMENT_ESTADO_LABELS[a.estado]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{a.nombre || 'Sin nombre'}</p>
                  </div>
                  <div className="flex gap-4 shrink-0 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Ganancia</p>
                      <p className={`text-sm font-mono ${r.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        Bs {fmt(r.ganancia)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">ROI</p>
                      <p className="text-sm font-mono">{(r.roi * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">TIR anual</p>
                      <p className="text-sm font-mono">{(r.tir_anual * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, value, bold, color, unit = 'Bs' }: {
  label: string; value: number; bold?: boolean; color?: string; unit?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>
        {unit ? `${unit} ${fmt(value)}` : fmt(value)}
      </p>
    </div>
  );
}

function PctItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono ${value < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
        {(value * 100).toFixed(1)}%
      </p>
    </div>
  );
}
