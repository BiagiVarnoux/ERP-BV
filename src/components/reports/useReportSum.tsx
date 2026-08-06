// src/components/reports/useReportSum.tsx
// Piezas reutilizables para "Seleccionar y sumar" EN TABLA en cada reporte.
// Se usa un checkbox EN LÍNEA dentro de la celda del nombre (no una columna
// aparte), para no tener que recalcular colSpans en tablas con secciones,
// subtotales y filas calculadas.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks } from 'lucide-react';
import { fmt } from '@/accounting/utils';

export function useReportSum() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const clear = () => setSelected(new Set());
  const close = () => { setActive(false); setSelected(new Set()); };
  const isSel = (id: string) => selected.has(id);
  // Suma los valores de las filas seleccionadas. `rows` es la lista plana de
  // cuentas seleccionables del reporte, con su valor mostrado.
  const sumOf = (rows: { id: string; value: number }[]) => {
    let sum = 0, count = 0;
    for (const r of rows) { if (selected.has(r.id)) { sum += r.value; count++; } }
    return { sum, count };
  };
  return { active, setActive, selected, toggle, clear, close, isSel, sumOf };
}

export function SumToggleButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" onClick={onToggle}>
      <ListChecks className="h-4 w-4 mr-2" />
      {active ? 'Cerrar selección' : 'Seleccionar y sumar'}
    </Button>
  );
}

// Checkbox en línea para anteponer dentro de una celda de nombre (sin columna extra).
export function RowCheck({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label?: string }) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={onToggle}
      onClick={e => e.stopPropagation()}
      aria-label={label}
      className="mr-2 align-middle inline-flex"
    />
  );
}

// Barra de suma inline (sin pop-up).
export function SumBar({
  count,
  sum,
  onClear,
  label = 'Suma de valores',
}: { count: number; sum: number; onClear: () => void; label?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
      <span className="text-sm font-semibold">
        {count} cuenta{count !== 1 ? 's' : ''} seleccionada{count !== 1 ? 's' : ''}
      </span>
      <span className="text-sm">{label}: <span className="font-mono font-bold text-primary">Bs {fmt(sum)}</span></span>
      {count > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline ml-auto"
          onClick={onClear}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
