// src/pages/ledger/Index.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { useAccounting } from '@/accounting/AccountingProvider';
import { cmpEntryOrder, signedBalanceFor, fmt } from '@/accounting/utils';
import { getCurrentQuarter, getAllQuartersFromStart, parseQuarterString } from '@/accounting/quarterly-utils';
import {
  PeriodType,
  getCurrentMonth,
  resolvePeriod,
  isDateInPeriod,
} from '@/accounting/period-utils';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { usePersistedState } from '@/hooks/usePersistedState';
import { exportLedgerToCSV, LedgerRow } from '@/services/exportService';

export default function LedgerPage() {
  const { accounts, entries, adapter } = useAccounting();
  const [ledgerAccount, setLedgerAccount] = usePersistedState<string>('ledger:account', 'A.1');
  const [period, setPeriod] = usePersistedState<{ periodType: PeriodType; quarter: string; year: number; month: string }>(
    'ledger:period',
    {
      periodType: 'quarterly',
      quarter: getCurrentQuarter().label,
      year: new Date().getFullYear(),
      month: getCurrentMonth().label,
    }
  );

  const availableQuarters = useMemo(() => getAllQuartersFromStart(2020), []);
  const currentQuarter = useMemo(() => parseQuarterString(period.quarter), [period.quarter]);
  const resolvedPeriod = useMemo(() => {
    const value = period.periodType === 'monthly' ? period.month
      : period.periodType === 'quarterly' ? period.quarter
      : String(period.year);
    return resolvePeriod({ type: period.periodType, value });
  }, [period]);

  // Ledger data
  const [ledgerState, setLedgerState] = useState<{
    rows: LedgerRow[];
    opening: number;
    closing: number;
  }>({ rows: [], opening: 0, closing: 0 });

  const ledgerData = useMemo(async () => {
    const acc = accounts.find(a => a.id === ledgerAccount);
    if (!acc) return { rows: [], opening: 0, closing: 0 };

    // Compute initial balance: sum signed balances for all entries strictly before period.startDate
    let initialBalance = 0;

    // Fast path: try cached closing balances at the day before period start
    try {
      // Day before the period starts
      const start = new Date(resolvedPeriod.startDate + 'T00:00:00');
      start.setDate(start.getDate() - 1);
      const beforeStart = start.toISOString().slice(0, 10);
      const closingBalances = await adapter.loadClosingBalances(beforeStart);
      const cached = closingBalances?.[ledgerAccount];
      if (typeof cached === 'number') {
        initialBalance = cached;
      } else {
        throw new Error('no-cache');
      }
    } catch {
      // Manual fallback
      entries.forEach(entry => {
        if (entry.date < resolvedPeriod.startDate) {
          entry.lines.forEach(line => {
            if (line.account_id === ledgerAccount) {
              initialBalance += signedBalanceFor(line.debit, line.credit, acc.normal_side);
            }
          });
        }
      });
    }

    const isResultAccount = acc.type === 'INGRESO' || acc.type === 'GASTO';
    if (isResultAccount) initialBalance = 0;

    // Filter entries within current period
    const inRange = entries
      .filter(e => isDateInPeriod(e.date, resolvedPeriod))
      .flatMap(e => e.lines.map(l => ({ e, l })))
      .filter(x => x.l.account_id === ledgerAccount)
      .sort((a, b) => cmpEntryOrder(a.e, b.e));

    // Build ledger entries with running balance
    let running = initialBalance;
    const rows: LedgerRow[] = inRange.map(({ e, l }) => {
      const delta = signedBalanceFor(l.debit, l.credit, acc.normal_side);
      running += delta;
      return {
        date: e.date,
        id: e.id,
        memo: e.memo || '',
        debit: l.debit,
        credit: l.credit,
        balance: running
      };
    });

    return { rows, opening: initialBalance, closing: running };
  }, [accounts, entries, ledgerAccount, resolvedPeriod, adapter]);

  // Handle async ledger data
  useEffect(() => {
    ledgerData.then(setLedgerState);
  }, [ledgerData]);

  function handleExport() {
    exportLedgerToCSV(
      ledgerState.rows,
      ledgerAccount,
      resolvedPeriod.label,
      ledgerState.opening,
      ledgerState.closing
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold">Libro Mayor</h1>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Exportar Mayor
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Libro Mayor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-1">
              <Label>Cuenta</Label>
              <Select value={ledgerAccount} onValueChange={setLedgerAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {accounts.map(a => 
                    <SelectItem key={a.id} value={a.id}>
                      {a.id} — {a.name}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 text-right">
              <div className="text-sm text-muted-foreground">
                Saldo inicial: <span className="font-semibold">{fmt(ledgerState.opening)}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Saldo final: <span className="font-semibold">{fmt(ledgerState.closing)}</span>
              </div>
            </div>
          </div>

          <PeriodSelector
            periodType={period.periodType}
            onPeriodTypeChange={(t) => setPeriod((p) => ({ ...p, periodType: t }))}
            selectedQuarter={period.quarter}
            onQuarterChange={(q) => setPeriod((p) => ({ ...p, quarter: q }))}
            selectedYear={period.year}
            onYearChange={(y) => setPeriod((p) => ({ ...p, year: y }))}
            selectedMonth={period.month}
            onMonthChange={(m) => setPeriod((p) => ({ ...p, month: m }))}
            availableQuarters={availableQuarters}
            currentQuarter={currentQuarter}
          />

          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Asiento</TableHead>
                  <TableHead>Glosa</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-medium">
                    Saldo Inicial
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmt(ledgerState.opening)}
                  </TableCell>
                </TableRow>
                {ledgerState.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay movimientos en el período seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerState.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-mono">{r.id}</TableCell>
                    <TableCell>{r.memo}</TableCell>
                    <TableCell className="text-right">
                      {r.debit ? fmt(r.debit) : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.credit ? fmt(r.credit) : ''}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmt(r.balance)}
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
