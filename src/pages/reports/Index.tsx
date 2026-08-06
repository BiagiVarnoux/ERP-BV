// src/pages/reports/Index.tsx
import React, { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccounting } from '@/accounting/AccountingProvider';
import { todayISO } from '@/accounting/utils';
import { getCurrentQuarter, getAllQuartersFromStart, parseQuarterString } from '@/accounting/quarterly-utils';
import { PeriodType, getCurrentMonth } from '@/accounting/period-utils';
import { usePersistedState } from '@/hooks/usePersistedState';

// Report components
import { TrialBalanceReport } from '@/components/reports/TrialBalanceReport';
import { IncomeStatementReport } from '@/components/reports/IncomeStatementReport';
import { BalanceSheetReport } from '@/components/reports/BalanceSheetReport';
import { CashFlowReport } from '@/components/reports/CashFlowReport';
import { EquityChangesReport } from '@/components/reports/EquityChangesReport';

interface PersistedReportPeriod {
  periodType: PeriodType;
  quarter: string;
  year: number;
  month: string;
}

export default function ReportsPage() {
  const { accounts, entries } = useAccounting();

  const [period, setPeriod] = usePersistedState<PersistedReportPeriod>('reports:period', {
    periodType: 'quarterly',
    quarter: getCurrentQuarter().label,
    year: new Date().getFullYear(),
    month: getCurrentMonth().label,
  });
  const [activeTab, setActiveTab] = usePersistedState<string>('reports:tab', 'trial-balance');
  const [bsDate, setBsDate] = usePersistedState<string>('reports:bsDate', todayISO());

  const availableQuarters = useMemo(() => getAllQuartersFromStart(2020), []);
  const currentQuarter = useMemo(() => parseQuarterString(period.quarter), [period.quarter]);

  const sharedProps = {
    accounts,
    entries,
    selectedQuarter: period.quarter,
    onQuarterChange: (q: string) => setPeriod((p) => ({ ...p, quarter: q })),
    selectedYear: period.year,
    onYearChange: (y: number) => setPeriod((p) => ({ ...p, year: y })),
    selectedMonth: period.month,
    onMonthChange: (m: string) => setPeriod((p) => ({ ...p, month: m })),
    periodType: period.periodType,
    onPeriodTypeChange: (t: PeriodType) => setPeriod((p) => ({ ...p, periodType: t })),
    availableQuarters,
    currentQuarter,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">Reportes Financieros</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <TabsList className="inline-flex w-max sm:grid sm:w-full sm:max-w-4xl sm:grid-cols-5">
          <TabsTrigger value="trial-balance">Balance Comprobación</TabsTrigger>
          <TabsTrigger value="income-statement">Estado Resultados</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance General</TabsTrigger>
          <TabsTrigger value="cash-flow">Flujo de Caja</TabsTrigger>
          <TabsTrigger value="equity-changes">Cambios Patrimonio</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="trial-balance" className="mt-6">
          <TrialBalanceReport {...sharedProps} />
        </TabsContent>

        <TabsContent value="income-statement" className="mt-6">
          <IncomeStatementReport {...sharedProps} />
        </TabsContent>

        <TabsContent value="balance-sheet" className="mt-6">
          <BalanceSheetReport
            accounts={accounts}
            entries={entries}
            bsDate={bsDate}
            onBsDateChange={setBsDate}
          />
        </TabsContent>

        <TabsContent value="cash-flow" className="mt-6">
          <CashFlowReport {...sharedProps} />
        </TabsContent>

        <TabsContent value="equity-changes" className="mt-6">
          <EquityChangesReport {...sharedProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
