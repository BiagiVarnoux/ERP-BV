// src/components/reports/TrialBalanceReport.tsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileDown, ListChecks, Eye } from 'lucide-react';
import { PeriodSelector, PeriodType } from './PeriodSelector';
import { Account, JournalEntry, AccountType, Side } from '@/accounting/types';
import { fmt, nowInAppTZ } from '@/accounting/utils';
import { Quarter, isDateInQuarter } from '@/accounting/quarterly-utils';
import { parseMonthString, isDateInMonth, isDateInYear, getYearPeriod } from '@/accounting/period-utils';
import { exportTrialBalanceToPDF, previewNextPdf } from '@/services/pdfService';

interface TrialBalanceReportProps {
  accounts: Account[];
  entries: JournalEntry[];
  selectedQuarter: string;
  onQuarterChange: (quarter: string) => void;
  availableQuarters: Quarter[];
  currentQuarter: Quarter;
  // Optional new props (lifted from page)
  periodType?: PeriodType;
  onPeriodTypeChange?: (t: PeriodType) => void;
  selectedYear?: number;
  onYearChange?: (y: number) => void;
  selectedMonth?: string;
  onMonthChange?: (m: string) => void;
}

export function TrialBalanceReport({
  accounts,
  entries,
  selectedQuarter,
  onQuarterChange,
  availableQuarters,
  currentQuarter,
  periodType = 'quarterly',
  onPeriodTypeChange = () => {},
  selectedYear = nowInAppTZ().year,
  onYearChange = () => {},
  selectedMonth = '',
  onMonthChange = () => {},
}: TrialBalanceReportProps) {
  const currentMonth = useMemo(() => {
    if (periodType !== 'monthly' || !selectedMonth) return null;
    try { return parseMonthString(selectedMonth); } catch { return null; }
  }, [periodType, selectedMonth]);

  const isInPeriod = useMemo(() => {
    if (periodType === 'monthly' && currentMonth) return (date: string) => isDateInMonth(date, currentMonth);
    if (periodType === 'annual') return (date: string) => isDateInYear(date, selectedYear);
    return (date: string) => isDateInQuarter(date, currentQuarter);
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const periodLabel = useMemo(() => {
    if (periodType === 'monthly') return selectedMonth;
    if (periodType === 'annual') return `Año ${selectedYear}`;
    return selectedQuarter;
  }, [periodType, selectedMonth, selectedYear, selectedQuarter]);

  const trialRows = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      type: AccountType;
      side: Side;
      debit: number;
      credit: number;
    }>();

    for (const a of accounts) {
      map.set(a.id, {
        id: a.id, name: a.name, type: a.type, side: a.normal_side, debit: 0, credit: 0,
      });
    }

    for (const e of entries) {
      if (!isInPeriod(e.date)) continue;
      for (const l of e.lines) {
        const r = map.get(l.account_id);
        if (!r) continue;
        r.debit += l.debit;
        r.credit += l.credit;
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
    const totals = rows.reduce(
      (t, r) => { t.debit += r.debit; t.credit += r.credit; return t; },
      { debit: 0, credit: 0 }
    );
    return { rows, totals };
  }, [accounts, entries, isInPeriod]);

  // ── Modo selección: sumar los saldos de las cuentas elegidas (inline, sin popup) ──
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  const toggleSel = (id: string) => setSeleccionadas(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const todasSeleccionadas = trialRows.rows.length > 0 && trialRows.rows.every(r => seleccionadas.has(r.id));
  const toggleTodas = () => setSeleccionadas(
    todasSeleccionadas ? new Set() : new Set(trialRows.rows.map(r => r.id))
  );

  const resumenSel = useMemo(() => {
    let debit = 0, credit = 0, saldo = 0, count = 0;
    for (const r of trialRows.rows) {
      if (!seleccionadas.has(r.id)) continue;
      count++;
      debit += r.debit;
      credit += r.credit;
      saldo += r.side === 'DEBE' ? r.debit - r.credit : r.credit - r.debit;
    }
    return { debit, credit, saldo, count };
  }, [trialRows.rows, seleccionadas]);

  const cerrarSeleccion = () => { setSeleccionando(false); setSeleccionadas(new Set()); };

  const handleExportPDF = (mode: 'save' | 'view' = 'save') => {
    const pdfRows = trialRows.rows.map(r => ({
      id: r.id, name: r.name, debit: r.debit, credit: r.credit,
      balance: r.side === 'DEBE' ? r.debit - r.credit : r.credit - r.debit,
    }));
    const run = () => exportTrialBalanceToPDF(pdfRows, trialRows.totals, periodLabel);
    if (mode === 'view') previewNextPdf(run); else run();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Balance de Comprobación</CardTitle>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
          <Button
            variant={seleccionando ? 'default' : 'outline'}
            size="sm"
            onClick={() => (seleccionando ? cerrarSeleccion() : setSeleccionando(true))}
          >
            <ListChecks className="h-4 w-4 mr-2" />
            {seleccionando ? 'Cerrar selección' : 'Seleccionar y sumar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportPDF('view')} title="Ver PDF">
            <Eye className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Ver</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportPDF('save')}>
            <FileDown className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PeriodSelector
          periodType={periodType}
          onPeriodTypeChange={onPeriodTypeChange}
          selectedQuarter={selectedQuarter}
          onQuarterChange={onQuarterChange}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
          availableQuarters={availableQuarters}
          currentQuarter={currentQuarter}
          currentYear={getYearPeriod(selectedYear)}
        />
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {seleccionando && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todasSeleccionadas}
                      onCheckedChange={toggleTodas}
                      aria-label="Seleccionar todas"
                    />
                  </TableHead>
                )}
                <TableHead>Código</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Debe</TableHead>
                <TableHead className="text-right">Haber</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trialRows.rows.map(r => {
                const saldo = r.side === 'DEBE' ? r.debit - r.credit : r.credit - r.debit;
                const sel = seleccionadas.has(r.id);
                return (
                  <TableRow
                    key={r.id}
                    className={`${seleccionando ? 'cursor-pointer' : ''} ${sel ? 'bg-primary/10' : ''}`}
                    onClick={seleccionando ? () => toggleSel(r.id) : undefined}
                  >
                    {seleccionando && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={sel} onCheckedChange={() => toggleSel(r.id)} aria-label={`Seleccionar ${r.name}`} />
                      </TableCell>
                    )}
                    <TableCell className="font-mono">{r.id}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.debit ? fmt(r.debit) : ''}</TableCell>
                    <TableCell className="text-right">{r.credit ? fmt(r.credit) : ''}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(saldo)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/50">
                <TableCell colSpan={seleccionando ? 3 : 2} className="text-right font-semibold">Totales</TableCell>
                <TableCell className="text-right font-semibold">{fmt(trialRows.totals.debit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(trialRows.totals.credit)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {fmt(trialRows.totals.debit - trialRows.totals.credit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Barra de suma de las cuentas seleccionadas (inline, sin popup) */}
        {seleccionando && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-sm font-semibold">
              {resumenSel.count} cuenta{resumenSel.count !== 1 ? 's' : ''} seleccionada{resumenSel.count !== 1 ? 's' : ''}
            </span>
            <span className="text-sm text-muted-foreground">Debe: <span className="font-mono font-medium text-foreground">Bs {fmt(resumenSel.debit)}</span></span>
            <span className="text-sm text-muted-foreground">Haber: <span className="font-mono font-medium text-foreground">Bs {fmt(resumenSel.credit)}</span></span>
            <span className="text-sm">Suma de saldos: <span className="font-mono font-bold text-primary">Bs {fmt(resumenSel.saldo)}</span></span>
            {resumenSel.count > 0 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline ml-auto"
                onClick={() => setSeleccionadas(new Set())}
              >
                Limpiar
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
