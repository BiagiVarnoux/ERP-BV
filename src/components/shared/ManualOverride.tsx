// src/components/shared/ManualOverride.tsx
// Override manual de un componente del costeo (flete, manipuleo, GA, IVA aduana),
// compartido por el cotizador de licitaciones y el análisis de inversión.
// Activás la casilla, tecleás el monto y elegís si es por unidad o total del lote;
// plegado muestra el valor calculado como referencia.

import React from 'react';
import { Input } from '@/components/ui/input';
import { fmt, round2, toDecimal } from '@/accounting/utils';

interface Props {
  label: string;
  cantidad: number;
  usa: boolean;
  valor: number | undefined;
  esTotal: boolean;
  /** Valor que produce el cálculo automático (referencia). */
  calculado: number;
  /** Fórmula corta del cálculo automático, ej. "peso × tarifa". */
  calculadoHint: string;
  onUsa: (v: boolean) => void;
  onValor: (v: number | undefined) => void;
  onEsTotal: (v: boolean) => void;
}

export function ManualOverride({
  label, cantidad, usa, valor, esTotal, calculado, calculadoHint,
  onUsa, onValor, onEsTotal,
}: Props) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none min-h-6">
        <input type="checkbox" checked={usa} onChange={e => onUsa(e.target.checked)} className="rounded" />
        <span className="font-medium">{label} manual</span>
        <span className="text-muted-foreground">{esTotal ? '(Bs total)' : '(Bs/unidad)'}</span>
      </label>

      {usa ? (
        <div className="flex items-center gap-2 flex-wrap pl-6">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-9 sm:h-7 text-xs px-1.5 text-right w-28"
            value={valor ?? ''}
            placeholder={fmt(calculado)}
            onChange={e => onValor(e.target.value === '' ? undefined : toDecimal(e.target.value))}
          />
          <div className="flex text-[10px]">
            <button
              type="button"
              onClick={() => onEsTotal(false)}
              className={`px-2 py-1 rounded-l border ${!esTotal ? 'bg-primary/10 border-primary' : 'border-border text-muted-foreground'}`}
            >
              /unidad
            </button>
            <button
              type="button"
              onClick={() => onEsTotal(true)}
              className={`px-2 py-1 rounded-r border-y border-r ${esTotal ? 'bg-primary/10 border-primary' : 'border-border text-muted-foreground'}`}
            >
              total
            </button>
          </div>
          {esTotal && valor != null && cantidad > 0 && (
            <span className="text-[10px] text-muted-foreground">= {fmt(round2(valor / cantidad))}/u</span>
          )}
          <span className="text-[10px] text-muted-foreground">calculado: Bs {fmt(calculado)}</span>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground pl-6">
          Calculado: Bs {fmt(calculado)} — {calculadoHint}
        </p>
      )}
    </div>
  );
}
