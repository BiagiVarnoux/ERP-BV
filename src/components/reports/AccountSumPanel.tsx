// src/components/reports/AccountSumPanel.tsx
// "Sumadora de cuentas": selecciona cuentas y suma sus saldos del período,
// INLINE (sin pop-up). Se usa en los reportes que no listan las cuentas como una
// tabla simple con checkbox (Estado de Resultados, Balance General, Flujo de
// Caja, Cambios en el Patrimonio). El Balance de Comprobación tiene su propia
// versión en-tabla.
//
// El saldo por cuenta se calcula igual que en el Balance de Comprobación:
// actividad del período (debe/haber de los asientos dentro del período elegido).
import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ListChecks, ChevronDown, ChevronRight } from 'lucide-react';
import { Account, JournalEntry, AccountType, Side } from '@/accounting/types';
import { fmt } from '@/accounting/utils';
import { Quarter, isDateInQuarter } from '@/accounting/quarterly-utils';
import { parseMonthString, isDateInMonth, isDateInYear } from '@/accounting/period-utils';
import { PeriodType } from './PeriodSelector';

interface Props {
  accounts: Account[];
  entries: JournalEntry[];
  periodType: PeriodType;
  currentQuarter: Quarter;
  selectedYear: number;
  selectedMonth: string;
}

export function AccountSumPanel({ accounts, entries, periodType, currentQuarter, selectedYear, selectedMonth }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  const isInPeriod = useMemo(() => {
    if (periodType === 'monthly' && selectedMonth) {
      try { const m = parseMonthString(selectedMonth); return (d: string) => isDateInMonth(d, m); } catch { return () => true; }
    }
    if (periodType === 'annual') return (d: string) => isDateInYear(d, selectedYear);
    return (d: string) => isDateInQuarter(d, currentQuarter);
  }, [periodType, selectedMonth, selectedYear, currentQuarter]);

  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: AccountType; side: Side; debit: number; credit: number }>();
    for (const a of accounts) map.set(a.id, { id: a.id, name: a.name, type: a.type, side: a.normal_side, debit: 0, credit: 0 });
    for (const e of entries) {
      if (!isInPeriod(e.date)) continue;
      for (const l of e.lines) {
        const r = map.get(l.account_id);
        if (!r) continue;
        r.debit += l.debit;
        r.credit += l.credit;
      }
    }
    return Array.from(map.values())
      .map(r => ({ ...r, saldo: r.side === 'DEBE' ? r.debit - r.credit : r.credit - r.debit }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [accounts, entries, isInPeriod]);

  const visibles = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => r.id.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
  }, [rows, q]);

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const resumen = useMemo(() => {
    let debit = 0, credit = 0, saldo = 0, count = 0;
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      count++;
      debit += r.debit;
      credit += r.credit;
      saldo += r.saldo;
    }
    return { debit, credit, saldo, count };
  }, [rows, selected]);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-3">
        <button
          type="button"
          className="w-full flex items-center gap-2 text-sm font-medium"
          onClick={() => setAbierto(o => !o)}
        >
          {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <ListChecks className="h-4 w-4 text-primary shrink-0" />
          Sumadora de cuentas
          <span className="hidden sm:inline text-xs text-muted-foreground font-normal">
            — selecciona cuentas y suma sus saldos del período (sin pop-up)
          </span>
          {resumen.count > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">{resumen.count} · Bs {fmt(resumen.saldo)}</Badge>
          )}
        </button>

        {abierto && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Buscar cuenta por código o nombre..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="h-8 max-w-xs"
              />
              {selected.size > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Limpiar selección
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {visibles.map(r => {
                const sel = selected.has(r.id);
                return (
                  <label
                    key={r.id}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
                  >
                    <Checkbox checked={sel} onCheckedChange={() => toggle(r.id)} />
                    <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{r.id}</span>
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="font-mono text-right">Bs {fmt(r.saldo)}</span>
                  </label>
                );
              })}
              {visibles.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">Sin cuentas que coincidan.</p>
              )}
            </div>

            {/* Suma inline de lo seleccionado */}
            <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="text-sm font-semibold">
                {resumen.count} cuenta{resumen.count !== 1 ? 's' : ''} seleccionada{resumen.count !== 1 ? 's' : ''}
              </span>
              <span className="text-sm text-muted-foreground">Debe: <span className="font-mono font-medium text-foreground">Bs {fmt(resumen.debit)}</span></span>
              <span className="text-sm text-muted-foreground">Haber: <span className="font-mono font-medium text-foreground">Bs {fmt(resumen.credit)}</span></span>
              <span className="text-sm">Suma de saldos: <span className="font-mono font-bold text-primary">Bs {fmt(resumen.saldo)}</span></span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
