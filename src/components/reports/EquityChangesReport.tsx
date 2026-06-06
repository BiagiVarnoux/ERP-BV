// src/components/reports/EquityChangesReport.tsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileDown, Scale } from 'lucide-react';
import { PeriodSelector, PeriodType, getYearPeriod, isDateInYear } from './PeriodSelector';
import { Account, JournalEntry } from '@/accounting/types';
import { fmt, round2 } from '@/accounting/utils';
import { Quarter, isDateInQuarter } from '@/accounting/quarterly-utils';
import { parseMonthString, isDateInMonth, MonthPeriod } from '@/accounting/period-utils';
import { exportEquityChangesToPDF } from '@/services/pdfService';
import { computeIncomeStatement } from './IncomeStatementReport';
import { computePeriodResult, findUtilidadesAcumuladasAccount } from '@/accounting/fiscal-year-utils';
import { useReportSettings } from '@/hooks/useReportSettings';

interface EquityChangesReportProps {
  accounts: Account[];
  entries: JournalEntry[];
  selectedQuarter: string;
  onQuarterChange: (quarter: string) => void;
  availableQuarters: Quarter[];
  currentQuarter: Quarter;
  periodType?: PeriodType;
  onPeriodTypeChange?: (t: PeriodType) => void;
  selectedYear?: number;
  onYearChange?: (y: number) => void;
  selectedMonth?: string;
  onMonthChange?: (m: string) => void;
}

export interface EquityColumn {
  accountId: string;
  accountName: string;
}

export interface EquityRow {
  label: string;
  rowType: 'opening' | 'movement' | 'net_income' | 'closing' | 'separator';
  values: Record<string, number>; // accountId -> amount
  total: number;
  isHighlighted?: boolean;
  isBold?: boolean;
}

export interface EquityChangesData {
  columns: EquityColumn[];
  rows: EquityRow[];
  periodLabel: string;
}

function computeEquityChanges(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  isInPeriod: (date: string) => boolean,
  netIncome: number
): EquityChangesData {

  // 1. Get all PATRIMONIO accounts
  const equityAccounts = accounts
    .filter(a => a.type === 'PATRIMONIO' && a.is_active)
    .sort((a, b) => a.id.localeCompare(b.id));

  const columns: EquityColumn[] = equityAccounts.map(a => ({
    accountId: a.id,
    accountName: a.name,
  }));

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  // Helper: compute balance for an account up to (not including) a date
  const balanceBefore = (accountId: string, beforeDate: string): number => {
    const account = accountMap.get(accountId);
    if (!account) return 0;
    let bal = 0;
    for (const entry of entries) {
      if (entry.date >= beforeDate) continue;
      for (const line of entry.lines) {
        if (line.account_id === accountId) {
          bal += line.credit - line.debit; // PATRIMONIO normal side is HABER
        }
      }
    }
    return round2(bal);
  };

  // Helper: compute movements in an account during the period, grouped by "memo category"
  // We classify each journal entry that touches a Pn account into a movement type
  const getMovementRows = (): EquityRow[] => {
    // Aggregate movements per equity account
    // We'll group by movement "label" derived from memo keywords
    const movementsMap = new Map<string, Record<string, number>>();

    for (const entry of entries) {
      if (!isInPeriod(entry.date)) continue;

      for (const line of entry.lines) {
        const account = accountMap.get(line.account_id);
        if (!account || account.type !== 'PATRIMONIO') continue;

        // Amount: positive = credit (increase equity), negative = debit (decrease equity)
        const amount = round2(line.credit - line.debit);
        if (amount === 0) continue;

        // Classify the movement by memo keywords
        const memo = (entry.memo || '').toLowerCase();
        let label = classifyEquityMovement(memo, amount);

        if (!movementsMap.has(label)) {
          movementsMap.set(label, {});
        }
        const row = movementsMap.get(label)!;
        row[line.account_id] = round2((row[line.account_id] || 0) + amount);
      }
    }

    // Convert to rows
    const rows: EquityRow[] = [];
    for (const [label, values] of movementsMap) {
      const total = round2(Object.values(values).reduce((s, v) => s + v, 0));
      if (total !== 0 || Object.values(values).some(v => v !== 0)) {
        rows.push({ label, rowType: 'movement', values, total });
      }
    }
    return rows;
  };

  // 2. Opening balances
  // Igual que el Balance General: saldo real de cuentas Pn + resultado I-G de gestiones anteriores
  // (el sistema no usa asientos de cierre, así que el resultado acumulado de años previos
  //  no está en Pn.2 sino en las cuentas I-G; lo sumamos a Pn.2 para presentación correcta)
  const openingValues: Record<string, number> = {};
  for (const col of columns) {
    openingValues[col.accountId] = balanceBefore(col.accountId, periodStart);
  }

  // Resultado I-G acumulado de TODAS las gestiones ANTERIORES al período
  const priorIGResult = computePeriodResult(accounts, entries, '0001-01-01', (() => {
    // un día antes de periodStart
    const d = new Date(periodStart);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })()).resultado;

  // Atribuirlo a Pn.2 (Utilidades Acumuladas) o a la última cuenta de patrimonio
  if (priorIGResult !== 0) {
    const uaAccount = findUtilidadesAcumuladasAccount(accounts);
    const targetId = uaAccount?.id ?? columns[columns.length - 1]?.accountId;
    if (targetId && openingValues[targetId] !== undefined) {
      openingValues[targetId] = round2(openingValues[targetId] + priorIGResult);
    } else if (targetId) {
      // La columna existe aunque el saldo contable sea 0
      openingValues[targetId] = round2(priorIGResult);
    }
  }

  const openingTotal = round2(Object.values(openingValues).reduce((s, v) => s + v, 0));

  // 3. Movement rows
  const movementRows = getMovementRows();

  // 4. Net income row — assign to Pn.2 if exists, otherwise first equity account
  const pn2 = equityAccounts.find(a => a.id === 'Pn.2') || equityAccounts.find(a => /resultado/i.test(a.name));
  const netIncomeValues: Record<string, number> = {};
  if (netIncome !== 0) {
    const targetId = pn2?.id || (equityAccounts[equityAccounts.length - 1]?.id);
    if (targetId) netIncomeValues[targetId] = netIncome;
  }

  // 5. Closing balances = opening + movements + net income
  const closingValues: Record<string, number> = {};
  for (const col of columns) {
    let closing = openingValues[col.accountId] || 0;
    for (const row of movementRows) {
      closing += row.values[col.accountId] || 0;
    }
    closing += netIncomeValues[col.accountId] || 0;
    closingValues[col.accountId] = round2(closing);
  }
  const closingTotal = round2(Object.values(closingValues).reduce((s, v) => s + v, 0));

  // 6. Assemble rows
  const rows: EquityRow[] = [
    {
      label: 'Saldo Inicial',
      rowType: 'opening',
      values: openingValues,
      total: openingTotal,
      isBold: true,
    },
    ...movementRows,
    ...(netIncome !== 0 ? [{
      label: netIncome >= 0 ? 'Utilidad Neta del Período' : 'Pérdida Neta del Período',
      rowType: 'net_income' as const,
      values: netIncomeValues,
      total: netIncome,
    }] : []),
    {
      label: 'Saldo Final',
      rowType: 'closing',
      values: closingValues,
      total: closingTotal,
      isBold: true,
      isHighlighted: true,
    },
  ];

  return { columns, rows, periodLabel: '' };
}

function classifyEquityMovement(memo: string, amount: number): string {
  if (/aporte|capital|suscri/i.test(memo)) return 'Aportes de Capital';
  if (/dividen|retiro|distribu/i.test(memo)) return amount < 0 ? 'Dividendos / Retiros' : 'Dividendos / Retiros';
  if (/cierre|resultado|utilidad|pérdida|perdida/i.test(memo)) return 'Cierre de Resultados';
  if (/reserva/i.test(memo)) return 'Constitución de Reservas';
  // Generic fallback
  return amount >= 0 ? 'Otros Aumentos de Patrimonio' : 'Otras Disminuciones de Patrimonio';
}

export function EquityChangesReport({
  accounts,
  entries,
  selectedQuarter,
  onQuarterChange,
  availableQuarters,
  currentQuarter,
  periodType: periodTypeProp,
  onPeriodTypeChange,
  selectedYear: selectedYearProp,
  onYearChange,
  selectedMonth: selectedMonthProp,
  onMonthChange,
}: EquityChangesReportProps) {
  const [periodTypeLocal, setPeriodTypeLocal] = useState<PeriodType>('annual');
  const [selectedYearLocal, setSelectedYearLocal] = useState(new Date().getFullYear());
  const [selectedMonthLocal, setSelectedMonthLocal] = useState('');
  const { settings } = useReportSettings();

  const periodType = periodTypeProp ?? periodTypeLocal;
  const setPeriodType = onPeriodTypeChange ?? setPeriodTypeLocal;
  const selectedYear = selectedYearProp ?? selectedYearLocal;
  const setSelectedYear = onYearChange ?? setSelectedYearLocal;
  const selectedMonth = selectedMonthProp ?? selectedMonthLocal;
  const setSelectedMonth = onMonthChange ?? setSelectedMonthLocal;

  const currentYear = useMemo(() => getYearPeriod(selectedYear), [selectedYear]);
  const currentMonth = useMemo<MonthPeriod | null>(() => {
    if (periodType !== 'monthly' || !selectedMonth) return null;
    try { return parseMonthString(selectedMonth); } catch { return null; }
  }, [periodType, selectedMonth]);

  const isInPeriod = useMemo(() => {
    return (date: string) => {
      if (periodType === 'monthly' && currentMonth) return isDateInMonth(date, currentMonth);
      if (periodType === 'quarterly') return isDateInQuarter(date, currentQuarter);
      return isDateInYear(date, selectedYear);
    };
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const periodStart = useMemo(() => {
    if (periodType === 'monthly' && currentMonth) return currentMonth.startDate;
    if (periodType === 'quarterly') return currentQuarter.startDate;
    return `${selectedYear}-01-01`;
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const periodEnd = useMemo(() => {
    if (periodType === 'monthly' && currentMonth) return currentMonth.endDate;
    if (periodType === 'quarterly') return currentQuarter.endDate;
    return `${selectedYear}-12-31`;
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const periodLabel = periodType === 'monthly' ? selectedMonth
    : periodType === 'quarterly' ? selectedQuarter
    : `Año ${selectedYear}`;

  // Compute net income for the period
  const netIncome = useMemo(() => {
    const is = computeIncomeStatement(accounts, entries, isInPeriod, {
      cost_of_sales_keywords: settings.cost_of_sales_keywords,
      operating_expense_keywords: settings.operating_expense_keywords,
      other_expense_keywords: settings.other_expense_keywords,
    });
    return is.utilidadNeta;
  }, [accounts, entries, isInPeriod, settings]);

  const data = useMemo(() => {
    return computeEquityChanges(
      accounts,
      entries,
      periodStart,
      periodEnd,
      isInPeriod,
      netIncome
    );
  }, [accounts, entries, periodStart, periodEnd, isInPeriod, netIncome]);

  const handleExportPDF = () => {
    exportEquityChangesToPDF({ ...data, periodLabel }, periodLabel);
  };

  const getCellClass = (amount: number | undefined) => {
    if (amount === undefined || amount === 0) return 'text-right text-muted-foreground';
    return amount >= 0 ? 'text-right text-green-700 dark:text-green-400' : 'text-right text-red-600 dark:text-red-400';
  };

  const getRowClass = (row: EquityRow) => {
    if (row.isHighlighted) return 'bg-primary/10 font-bold border-t-2';
    if (row.rowType === 'opening') return 'bg-muted/30 font-semibold';
    if (row.rowType === 'net_income') return 'bg-blue-50 dark:bg-blue-950/20';
    return '';
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Estado de Cambios en el Patrimonio
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Variaciones en el patrimonio neto del período
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-2" />
          PDF
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <PeriodSelector
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          selectedQuarter={selectedQuarter}
          onQuarterChange={onQuarterChange}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          availableQuarters={availableQuarters}
          currentQuarter={currentQuarter}
          currentYear={currentYear}
        />

        {/* Net income context */}
        <div className={`text-sm p-3 rounded-lg border ${netIncome >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-red-50 dark:bg-red-950/20 border-red-200'}`}>
          <span className="font-medium">
            {netIncome >= 0 ? 'Utilidad' : 'Pérdida'} del período ({periodLabel}):
          </span>{' '}
          <span className={`font-mono font-semibold ${netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {netIncome >= 0 ? '+' : ''}{fmt(netIncome)}
          </span>
          <span className="text-muted-foreground text-xs ml-2">
            (calculado del Estado de Resultados)
          </span>
        </div>

        {data.columns.length === 0 ? (
          <p className="text-muted-foreground italic text-center py-8">
            No se encontraron cuentas de Patrimonio activas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="min-w-[220px]">Concepto</TableHead>
                  {data.columns.map(col => (
                    <TableHead key={col.accountId} className="text-right min-w-[140px]">
                      <div className="font-mono text-xs text-muted-foreground">{col.accountId}</div>
                      <div>{col.accountName}</div>
                    </TableHead>
                  ))}
                  <TableHead className="text-right min-w-[140px] font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, idx) => (
                  <TableRow key={idx} className={getRowClass(row)}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {data.columns.map(col => {
                      const val = row.values[col.accountId];
                      return (
                        <TableCell key={col.accountId} className={getCellClass(val)}>
                          {val !== undefined && val !== 0
                            ? `${val > 0 ? '+' : ''}${fmt(val)}`
                            : <span className="text-muted-foreground/40">—</span>
                          }
                        </TableCell>
                      );
                    })}
                    <TableCell className={`font-semibold ${getCellClass(row.total)}`}>
                      {row.total !== 0 ? `${row.total > 0 ? '+' : ''}${fmt(row.total)}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Note */}
        <p className="text-xs text-muted-foreground">
          * La utilidad/pérdida del período se muestra como movimiento hacia Resultados Acumulados (Pn.2).
          Si realizaste un asiento de cierre manual que ya transfiere el resultado a Pn.2,
          evita registrar el período antes de ese cierre para no duplicar el efecto.
        </p>
      </CardContent>
    </Card>
  );
}
