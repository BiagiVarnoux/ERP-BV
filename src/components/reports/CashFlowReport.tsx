// src/components/reports/CashFlowReport.tsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FileDown, TrendingUp, TrendingDown, Wallet, Eye } from 'lucide-react';
import { PeriodSelector, PeriodType, getYearPeriod, isDateInYear, YearPeriod } from './PeriodSelector';
import { Account, JournalEntry } from '@/accounting/types';
import { fmt, round2 } from '@/accounting/utils';
import { Quarter, isDateInQuarter } from '@/accounting/quarterly-utils';
import { parseMonthString, isDateInMonth, MonthPeriod } from '@/accounting/period-utils';
import { exportCashFlowNIIFToPDF, CashFlowNIIFData, previewNextPdf } from '@/services/pdfService';
import { computeIncomeStatement } from './IncomeStatementReport';
import { useReportSettings } from '@/hooks/useReportSettings';
import { useReportSum, SumToggleButton, RowCheck, SumBar } from './useReportSum';

interface CashFlowReportProps {
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

// Identify cash accounts (NIC 7 - Cash and cash equivalents)
function isCashAccount(account: Account): boolean {
  if (account.is_cash_equivalent === true) return true;
  if (account.is_cash_equivalent === false) return false;
  const cashKeywords = ['banco', 'caja', 'efectivo', 'cash', 'usdt', 'usd', 'btc', 'cripto', 'equivalente'];
  const lowerName = account.name.toLowerCase();
  return account.type === 'ACTIVO' && cashKeywords.some(k => lowerName.includes(k));
}

// Classify movement by activity type according to NIC 7
function classifyMovementNIC7(
  account: Account,
  allAccounts: Account[]
): 'operacion' | 'inversion' | 'financiacion' {
  // Primary: use clasificacion_flujo if available
  if (account.clasificacion_flujo) {
    const cf = account.clasificacion_flujo;
    if (cf === 'operacion') return 'operacion';
    if (cf === 'inversion') return 'inversion';
    if (cf === 'financiamiento') return 'financiacion';
  }

  const lowerName = account.name.toLowerCase();

  if (account.type === 'INGRESO' || account.type === 'GASTO') return 'operacion';

  const operatingKeywords = [
    'cobrar', 'pagar', 'inventario', 'mercaderia', 'mercadería',
    'iva', 'impuesto', 'anticipo', 'prepago', 'diferido'
  ];
  if (operatingKeywords.some(k => lowerName.includes(k))) return 'operacion';

  if (account.type === 'PATRIMONIO') return 'financiacion';

  const financingKeywords = [
    'capital', 'préstamo', 'prestamo', 'deuda', 'dividendo',
    'aporte', 'accionista', 'reserva', 'utilidades retenidas'
  ];
  if (financingKeywords.some(k => lowerName.includes(k))) return 'financiacion';

  if (account.type === 'PASIVO') {
    if (lowerName.includes('largo plazo') || lowerName.includes('préstamo') || lowerName.includes('prestamo')) {
      return 'financiacion';
    }
    return 'operacion';
  }

  return 'inversion';
}

interface CashFlowItem {
  id: string;
  name: string;
  amount: number;
}

type CashFlowMethod = 'directo' | 'indirecto';

export function CashFlowReport({
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
}: CashFlowReportProps) {
  const [periodTypeLocal, setPeriodTypeLocal] = useState<PeriodType>('quarterly');
  const [selectedYearLocal, setSelectedYearLocal] = useState(new Date().getFullYear());
  const [selectedMonthLocal, setSelectedMonthLocal] = useState('');
  const [metodo, setMetodo] = useState<CashFlowMethod>('directo');
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

  // Period helpers
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

  // === SHARED DATA ===
  const sharedData = useMemo(() => {
    const cashAccounts = accounts.filter(isCashAccount);
    const cashAccountIds = new Set(cashAccounts.map(a => a.id));
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    // Initial cash balance (before period start)
    let initialCashBalance = 0;
    for (const entry of entries) {
      if (entry.date >= periodStart) continue;
      for (const line of entry.lines) {
        if (cashAccountIds.has(line.account_id)) {
          initialCashBalance += line.debit - line.credit;
        }
      }
    }

    // Total liabilities for ratio
    let totalLiabilities = 0;
    for (const account of accounts) {
      if (account.type === 'PASIVO') {
        let balance = 0;
        for (const entry of entries) {
          if (entry.date > periodEnd) continue;
          for (const line of entry.lines) {
            if (line.account_id === account.id) {
              balance += line.credit - line.debit;
            }
          }
        }
        totalLiabilities += balance;
      }
    }

    return { cashAccounts, cashAccountIds, accountMap, initialCashBalance, totalLiabilities };
  }, [accounts, entries, periodStart, periodEnd]);

  // === DIRECT METHOD ===
  const directData = useMemo(() => {
    const { cashAccountIds, accountMap } = sharedData;

    const operacionItems: CashFlowItem[] = [];
    const inversionItems: CashFlowItem[] = [];
    const financiacionItems: CashFlowItem[] = [];

    for (const entry of entries) {
      if (!isInPeriod(entry.date)) continue;

      let cashMovement = 0;
      const nonCashLines: Array<{ account: Account; debit: number; credit: number }> = [];

      for (const line of entry.lines) {
        if (cashAccountIds.has(line.account_id)) {
          cashMovement += line.debit - line.credit;
        } else {
          const account = accountMap.get(line.account_id);
          if (account) nonCashLines.push({ account, debit: line.debit, credit: line.credit });
        }
      }

      if (cashMovement !== 0 && nonCashLines.length > 0) {
        const mainCounterpart = nonCashLines[0];
        const activity = classifyMovementNIC7(mainCounterpart.account, accounts);
        const detailItem: CashFlowItem = {
          id: mainCounterpart.account.id,
          name: mainCounterpart.account.name,
          amount: cashMovement,
        };

        switch (activity) {
          case 'operacion': operacionItems.push(detailItem); break;
          case 'inversion': inversionItems.push(detailItem); break;
          case 'financiacion': financiacionItems.push(detailItem); break;
        }
      }
    }

    const aggregateByAccount = (items: CashFlowItem[]): CashFlowItem[] => {
      const map = new Map<string, CashFlowItem>();
      for (const item of items) {
        const existing = map.get(item.id);
        if (existing) existing.amount += item.amount;
        else map.set(item.id, { ...item });
      }
      return Array.from(map.values()).filter(i => i.amount !== 0).sort((a, b) => a.id.localeCompare(b.id));
    };

    const operacionDetalle = aggregateByAccount(operacionItems);
    const inversionDetalle = aggregateByAccount(inversionItems);
    const financiacionDetalle = aggregateByAccount(financiacionItems);

    const flujoOperacion = round2(operacionDetalle.reduce((sum, i) => sum + i.amount, 0));
    const flujoInversion = round2(inversionDetalle.reduce((sum, i) => sum + i.amount, 0));
    const flujoFinanciacion = round2(financiacionDetalle.reduce((sum, i) => sum + i.amount, 0));

    return { operacionDetalle, inversionDetalle, financiacionDetalle, flujoOperacion, flujoInversion, flujoFinanciacion };
  }, [entries, isInPeriod, sharedData, accounts]);

  // === INDIRECT METHOD ===
  const indirectData = useMemo(() => {
    // 1. Get Net Income from Income Statement
    const incomeStatement = computeIncomeStatement(accounts, entries, isInPeriod, {
      cost_of_sales_keywords: settings.cost_of_sales_keywords,
      operating_expense_keywords: settings.operating_expense_keywords,
      other_expense_keywords: settings.other_expense_keywords,
    });
    const utilidadNeta = incomeStatement.utilidadNeta;

    // 2. Non-monetary adjustments (es_partida_no_monetaria = true)
    const ajustesNoMonetarios: CashFlowItem[] = [];
    for (const account of accounts) {
      if (!account.es_partida_no_monetaria) continue;
      let amount = 0;
      for (const entry of entries) {
        if (!isInPeriod(entry.date)) continue;
        for (const line of entry.lines) {
          if (line.account_id === account.id) {
            // Expenses are debit-side; we add them back
            amount += line.debit - line.credit;
          }
        }
      }
      if (amount !== 0) {
        ajustesNoMonetarios.push({ id: account.id, name: account.name, amount });
      }
    }
    const totalAjustesNoMonetarios = round2(ajustesNoMonetarios.reduce((s, i) => s + i.amount, 0));

    // 3. Working capital variations
    const variacionesCapitalTrabajo: CashFlowItem[] = [];
    const { cashAccountIds } = sharedData;

    for (const account of accounts) {
      // Skip cash, income, expense accounts
      if (cashAccountIds.has(account.id)) continue;
      if (account.type === 'INGRESO' || account.type === 'GASTO') continue;
      if (account.es_partida_no_monetaria) continue;

      // Only working capital accounts
      const isWorkingCapital = account.es_capital_trabajo === true ||
        (account.es_capital_trabajo !== false && account.is_current === true &&
          (account.type === 'ACTIVO' || account.type === 'PASIVO'));

      if (!isWorkingCapital) continue;

      // Classify: must be operating
      const activity = classifyMovementNIC7(account, accounts);
      if (activity !== 'operacion') continue;

      // Calculate balance at start and end of period
      let balanceAtStart = 0;
      let balanceAtEnd = 0;
      for (const entry of entries) {
        if (entry.date >= periodStart) {
          // After period start
          if (entry.date <= periodEnd) {
            // In period - add to end balance
            for (const line of entry.lines) {
              if (line.account_id === account.id) {
                if (account.type === 'ACTIVO') {
                  balanceAtEnd += line.debit - line.credit;
                } else {
                  balanceAtEnd += line.credit - line.debit;
                }
              }
            }
          }
        } else {
          // Before period start - contributes to start balance
          for (const line of entry.lines) {
            if (line.account_id === account.id) {
              if (account.type === 'ACTIVO') {
                balanceAtStart += line.debit - line.credit;
              } else {
                balanceAtStart += line.credit - line.debit;
              }
            }
          }
        }
      }

      // Variation = end balance (including start) minus start balance
      const endTotal = balanceAtStart + balanceAtEnd;
      const variation = endTotal - balanceAtStart; // = balanceAtEnd (movement in period)

      if (variation === 0) continue;

      // For assets: increase uses cash (negative), decrease frees cash (positive)
      // For liabilities: increase provides cash (positive), decrease uses cash (negative)
      const cashEffect = account.type === 'ACTIVO' ? -variation : variation;

      variacionesCapitalTrabajo.push({
        id: account.id,
        name: account.name,
        amount: round2(cashEffect),
      });
    }

    variacionesCapitalTrabajo.sort((a, b) => a.id.localeCompare(b.id));

    const totalVariacionesCT = round2(variacionesCapitalTrabajo.reduce((s, i) => s + i.amount, 0));

    const flujoOperativoIndirecto = round2(utilidadNeta + totalAjustesNoMonetarios + totalVariacionesCT);

    // Investment & Financing: reuse direct method data
    return {
      utilidadNeta,
      ajustesNoMonetarios,
      totalAjustesNoMonetarios,
      variacionesCapitalTrabajo,
      totalVariacionesCT,
      flujoOperativoIndirecto,
    };
  }, [accounts, entries, isInPeriod, settings, sharedData, periodStart, periodEnd]);

  // === COMBINED RESULTS ===
  const flujoOperacion = metodo === 'directo' ? directData.flujoOperacion : indirectData.flujoOperativoIndirecto;
  const flujoInversion = directData.flujoInversion;
  const flujoFinanciacion = directData.flujoFinanciacion;
  const flujoNeto = round2(flujoOperacion + flujoInversion + flujoFinanciacion);
  const finalCashBalance = round2(sharedData.initialCashBalance + flujoNeto);
  const ratioCobertura = sharedData.totalLiabilities > 0 ? flujoOperacion / sharedData.totalLiabilities : null;

  // ── Selección y suma en tabla (inline, sin popup) ──
  const sel = useReportSum();
  const selectableRows = useMemo(() => {
    const base = [...directData.inversionDetalle, ...directData.financiacionDetalle];
    if (metodo === 'directo') base.push(...directData.operacionDetalle);
    else base.push(...indirectData.ajustesNoMonetarios, ...indirectData.variacionesCapitalTrabajo);
    return base.map(x => ({ id: x.id, value: x.amount }));
  }, [directData, indirectData, metodo]);
  const resumenSel = sel.sumOf(selectableRows);

  const handleExportPDF = (mode: 'save' | 'view' = 'save') => {
    const periodLabel = periodType === 'monthly' ? selectedMonth
      : periodType === 'quarterly' ? selectedQuarter
      : `Año ${selectedYear}`;
    const pdfData: CashFlowNIIFData = {
      metodo,
      initialCashBalance: sharedData.initialCashBalance,
      operacionDetalle: directData.operacionDetalle,
      flujoOperacion,
      inversionDetalle: directData.inversionDetalle,
      flujoInversion,
      financiacionDetalle: directData.financiacionDetalle,
      flujoFinanciacion,
      flujoNeto,
      finalCashBalance,
      ratioCobertura,
      // Indirect-specific
      utilidadNeta: indirectData.utilidadNeta,
      ajustesNoMonetarios: indirectData.ajustesNoMonetarios,
      totalAjustesNoMonetarios: indirectData.totalAjustesNoMonetarios,
      variacionesCapitalTrabajo: indirectData.variacionesCapitalTrabajo,
      totalVariacionesCT: indirectData.totalVariacionesCT,
      flujoOperativoIndirecto: indirectData.flujoOperativoIndirecto,
    };
    const run = () => exportCashFlowNIIFToPDF(pdfData, periodLabel);
    if (mode === 'view') previewNextPdf(run); else run();
  };

  const renderSection = (
    title: string,
    subtitle: string,
    items: CashFlowItem[],
    total: number,
    colorClass: string,
    bgClass: string
  ) => (
    <div className="space-y-2">
      <div className={`${bgClass} p-3 rounded-lg`}>
        <h3 className={`font-semibold ${colorClass}`}>{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {items.length > 0 ? (
        <Table>
          <TableBody>
            {items.map((item, idx) => {
              const s = sel.isSel(item.id);
              return (
                <TableRow
                  key={`${item.id}-${idx}`}
                  className={`${sel.active ? 'cursor-pointer' : ''} ${s ? 'bg-primary/10' : ''}`}
                  onClick={sel.active ? () => sel.toggle(item.id) : undefined}
                >
                  <TableCell className="font-mono text-xs w-20">{item.id}</TableCell>
                  <TableCell>
                    {sel.active && <RowCheck checked={s} onToggle={() => sel.toggle(item.id)} label={item.name} />}
                    {item.name}
                  </TableCell>
                  <TableCell className={`text-right ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/30">
              <TableCell colSpan={2} className="font-medium text-right">Flujo Neto</TableCell>
              <TableCell className={`text-right font-semibold ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {total >= 0 ? '+' : ''}{fmt(total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm italic pl-4">Sin movimientos</p>
      )}
    </div>
  );

  const renderIndirectOperating = () => (
    <div className="space-y-2">
      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
        <h3 className="font-semibold text-blue-700 dark:text-blue-400">Actividades de Operación (Método Indirecto)</h3>
        <p className="text-xs text-muted-foreground">Partiendo de la Utilidad Neta del Estado de Resultados (NIC 7.18-20)</p>
      </div>
      <Table>
        <TableBody>
          {/* Net Income */}
          <TableRow className="bg-muted/20">
            <TableCell colSpan={2} className="font-semibold">Utilidad Neta del Período</TableCell>
            <TableCell className={`text-right font-semibold ${indirectData.utilidadNeta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(indirectData.utilidadNeta)}
            </TableCell>
          </TableRow>

          {/* Non-monetary adjustments */}
          {indirectData.ajustesNoMonetarios.length > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={3} className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-4">
                  (+) Ajustes por partidas no monetarias
                </TableCell>
              </TableRow>
              {indirectData.ajustesNoMonetarios.map((item, idx) => {
                const s = sel.isSel(item.id);
                return (
                  <TableRow
                    key={`nm-${item.id}-${idx}`}
                    className={`${sel.active ? 'cursor-pointer' : ''} ${s ? 'bg-primary/10' : ''}`}
                    onClick={sel.active ? () => sel.toggle(item.id) : undefined}
                  >
                    <TableCell className="font-mono text-xs w-20">{item.id}</TableCell>
                    <TableCell>
                      {sel.active && <RowCheck checked={s} onToggle={() => sel.toggle(item.id)} label={item.name} />}
                      {item.name}
                    </TableCell>
                    <TableCell className={`text-right ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/10">
                <TableCell colSpan={2} className="text-right text-sm">Subtotal Ajustes No Monetarios</TableCell>
                <TableCell className={`text-right font-medium ${indirectData.totalAjustesNoMonetarios >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {indirectData.totalAjustesNoMonetarios >= 0 ? '+' : ''}{fmt(indirectData.totalAjustesNoMonetarios)}
                </TableCell>
              </TableRow>
            </>
          )}

          {/* Working capital variations */}
          {indirectData.variacionesCapitalTrabajo.length > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={3} className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-4">
                  (+/-) Variaciones en Capital de Trabajo
                </TableCell>
              </TableRow>
              {indirectData.variacionesCapitalTrabajo.map((item, idx) => {
                const s = sel.isSel(item.id);
                return (
                  <TableRow
                    key={`wc-${item.id}-${idx}`}
                    className={`${sel.active ? 'cursor-pointer' : ''} ${s ? 'bg-primary/10' : ''}`}
                    onClick={sel.active ? () => sel.toggle(item.id) : undefined}
                  >
                    <TableCell className="font-mono text-xs w-20">{item.id}</TableCell>
                    <TableCell>
                      {sel.active && <RowCheck checked={s} onToggle={() => sel.toggle(item.id)} label={item.name} />}
                      {item.amount >= 0
                        ? `Disminución en ${item.name}`
                        : `(Aumento) en ${item.name}`
                      }
                    </TableCell>
                    <TableCell className={`text-right ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/10">
                <TableCell colSpan={2} className="text-right text-sm">Subtotal Variaciones C.T.</TableCell>
                <TableCell className={`text-right font-medium ${indirectData.totalVariacionesCT >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {indirectData.totalVariacionesCT >= 0 ? '+' : ''}{fmt(indirectData.totalVariacionesCT)}
                </TableCell>
              </TableRow>
            </>
          )}

          {/* Operating total */}
          <TableRow className="bg-muted/30">
            <TableCell colSpan={2} className="font-medium text-right">Flujo Neto de Operación</TableCell>
            <TableCell className={`text-right font-semibold ${indirectData.flujoOperativoIndirecto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {indirectData.flujoOperativoIndirecto >= 0 ? '+' : ''}{fmt(indirectData.flujoOperativoIndirecto)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Estado de Flujo de Efectivo (NIC 7)
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {metodo === 'directo' ? 'Método Directo' : 'Método Indirecto'}
          </p>
        </div>
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2">
            <Label htmlFor="metodo-toggle" className="text-xs text-muted-foreground">Directo</Label>
            <Switch
              id="metodo-toggle"
              checked={metodo === 'indirecto'}
              onCheckedChange={(checked) => setMetodo(checked ? 'indirecto' : 'directo')}
            />
            <Label htmlFor="metodo-toggle" className="text-xs text-muted-foreground">Indirecto</Label>
          </div>
          <SumToggleButton active={sel.active} onToggle={() => (sel.active ? sel.close() : sel.setActive(true))} />
          <Button variant="outline" size="sm" onClick={() => handleExportPDF('view')} title="Ver PDF">
            <Eye className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Ver</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportPDF('save')}>
            <FileDown className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </div>
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

        {/* Cash accounts identified */}
        {sharedData.cashAccounts.length > 0 && (
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <span className="font-medium">Efectivo y equivalentes: </span>
            {sharedData.cashAccounts.map(a => a.name).join(', ')}
          </div>
        )}

        {/* Initial Balance */}
        <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/30">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Saldo Inicial de Efectivo</span>
            <span className="font-mono text-lg">{fmt(sharedData.initialCashBalance)}</span>
          </div>
        </div>

        {/* Operating Activities */}
        {metodo === 'directo' ? (
          renderSection(
            'Actividades de Operación',
            'Actividades principales que producen ingresos (NIC 7.14-20)',
            directData.operacionDetalle,
            directData.flujoOperacion,
            'text-blue-700 dark:text-blue-400',
            'bg-blue-50 dark:bg-blue-950/30'
          )
        ) : (
          renderIndirectOperating()
        )}

        {/* Investment Activities (NIC 7.16) */}
        {renderSection(
          'Actividades de Inversión',
          'Adquisición y disposición de activos a largo plazo (NIC 7.16)',
          directData.inversionDetalle,
          flujoInversion,
          'text-purple-700 dark:text-purple-400',
          'bg-purple-50 dark:bg-purple-950/30'
        )}

        {/* Financing Activities (NIC 7.17) */}
        {renderSection(
          'Actividades de Financiación',
          'Cambios en capital y préstamos (NIC 7.17)',
          directData.financiacionDetalle,
          flujoFinanciacion,
          'text-orange-700 dark:text-orange-400',
          'bg-orange-50 dark:bg-orange-950/30'
        )}

        {/* Barra de suma de las cuentas seleccionadas (inline, sin popup) */}
        {sel.active && (
          <SumBar count={resumenSel.count} sum={resumenSel.sum} onClear={sel.clear} label="Suma de flujos" />
        )}

        {/* Net Cash Flow */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Variación Neta de Efectivo</span>
            <span className={`font-mono text-lg font-bold flex items-center gap-2 ${flujoNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {flujoNeto >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {flujoNeto >= 0 ? '+' : ''}{fmt(flujoNeto)}
            </span>
          </div>
        </div>

        {/* Final Balance */}
        <div className="border rounded-lg p-4 bg-primary/10">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Saldo Final de Efectivo</span>
            <span className="font-mono text-xl font-bold">{fmt(finalCashBalance)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Verificación: {fmt(sharedData.initialCashBalance)} + {fmt(flujoNeto)} = {fmt(finalCashBalance)}
          </div>
        </div>

        {/* Financial Ratios */}
        {ratioCobertura !== null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Ratio de Cobertura de Efectivo</div>
                <div className={`text-2xl font-bold ${ratioCobertura >= 1 ? 'text-green-600' : 'text-amber-600'}`}>
                  {ratioCobertura.toFixed(2)}x
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Flujo Operativo / Pasivos
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Crecimiento de Efectivo</div>
                <div className={`text-2xl font-bold ${flujoNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {sharedData.initialCashBalance > 0
                    ? `${((flujoNeto / sharedData.initialCashBalance) * 100).toFixed(1)}%`
                    : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  vs Saldo Inicial
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
