// src/components/reports/IncomeStatementReport.tsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PeriodSelector, PeriodType, getYearPeriod, isDateInYear, YearPeriod } from './PeriodSelector';
import { Account, JournalEntry } from '@/accounting/types';
import { fmt, round2, nowInAppTZ } from '@/accounting/utils';
import { Quarter, isDateInQuarter, getPreviousQuarter, parseQuarterString } from '@/accounting/quarterly-utils';
import { parseMonthString, isDateInMonth, MonthPeriod } from '@/accounting/period-utils';
import { exportIncomeStatementNIIFToPDF } from '@/services/pdfService';
import { useReportSettings } from '@/hooks/useReportSettings';

interface IncomeStatementReportProps {
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

interface AccountDetail {
  id: string;
  name: string;
  amount: number;
}

export interface ProfessionalIncomeStatement {
  // 1. INGRESOS OPERATIVOS
  ingresosOperativos: AccountDetail[];
  devoluciones: AccountDetail[];
  ingresosNetos: number;
  otrosIngresosOperativos: AccountDetail[];
  totalIngresosOperativos: number;

  // 2. COSTO DE VENTAS
  costoVentas: AccountDetail[];
  totalCostoVentas: number;

  // UTILIDAD BRUTA
  utilidadBruta: number;
  margenBruto: number;

  // 3. GASTOS OPERATIVOS
  gastosOperativos: AccountDetail[];
  depreciacionAmortizacion: AccountDetail[];
  totalGastosOperativosSinDA: number;
  totalDA: number;
  totalGastosOperativos: number;

  // EBITDA
  ebitda: number;
  margenEbitda: number;

  // EBIT
  ebit: number;
  margenOperativo: number;

  // 4. RESULTADO FINANCIERO
  ingresosFinancieros: AccountDetail[];
  gastosFinancieros: AccountDetail[];
  resultadoFinanciero: number;

  // EBT
  ebt: number;

  // 5. PARTIDAS EXTRAORDINARIAS
  extraordinarios: AccountDetail[];
  totalExtraordinarios: number;

  // UTILIDAD ANTES DE IMPUESTOS
  utilidadAntesImpuestos: number;

  // 6. IMPUESTOS
  impuestosCuentas: AccountDetail[];
  impuesto: number;

  // UTILIDAD NETA
  utilidadNeta: number;
  margenNeto: number;
}

type AccountClassification =
  | 'ingreso_operativo'
  | 'ingreso_operativo_devolucion'
  | 'ingreso_operativo_otro'
  | 'costo_ventas'
  | 'gasto_operativo'
  | 'gasto_operativo_da'
  | 'ingreso_financiero'
  | 'gasto_financiero'
  | 'extraordinario'
  | 'impuesto'
  | 'gasto_no_operativo';

function classifyAccount(
  account: Account,
  costoKeywords: string[],
  operativoKeywords: string[],
  otrosKeywords: string[]
): AccountClassification {
  // 1. Use advanced clasificacion_resultado as primary source
  if (account.clasificacion_resultado) {
    const cr = account.clasificacion_resultado;

    if (cr === 'ingreso_operativo') {
      const sub = account.subclasificacion_resultado;
      if (sub === 'devoluciones') return 'ingreso_operativo_devolucion';
      if (sub === 'otros_ingresos_operativos') return 'ingreso_operativo_otro';
      return 'ingreso_operativo';
    }
    if (cr === 'ingreso_no_operativo') {
      if (account.es_financiera) return 'ingreso_financiero';
      if (account.es_extraordinaria) return 'extraordinario';
      return 'ingreso_financiero'; // default non-operating income to financial
    }
    if (cr === 'costo_ventas') return 'costo_ventas';
    if (cr === 'gasto_operativo') {
      if (account.es_partida_no_monetaria) return 'gasto_operativo_da';
      const sub = account.subclasificacion_resultado;
      if (sub === 'depreciacion' || sub === 'amortizacion') return 'gasto_operativo_da';
      return 'gasto_operativo';
    }
    if (cr === 'gasto_no_operativo') {
      if (account.es_financiera) return 'gasto_financiero';
      if (account.es_extraordinaria) return 'extraordinario';
      return 'gasto_no_operativo';
    }
    if (cr === 'impuesto') return 'impuesto';
  }

  // 2. Fallback: expense_category
  if (account.type === 'INGRESO') return 'ingreso_operativo';

  if (account.type === 'GASTO') {
    if (account.expense_category) {
      switch (account.expense_category) {
        case 'COSTO_VENTAS': return 'costo_ventas';
        case 'GASTO_OPERATIVO': return 'gasto_operativo';
        case 'OTRO_GASTO': return 'gasto_no_operativo';
      }
    }

    // 3. Keyword heuristics
    const lowerName = account.name.toLowerCase();
    if (costoKeywords.some(k => lowerName.includes(k))) return 'costo_ventas';
    if (otrosKeywords.some(k => lowerName.includes(k))) return 'gasto_no_operativo';
    return 'gasto_operativo';
  }

  return 'gasto_operativo';
}

export function computeIncomeStatement(
  accounts: Account[],
  entries: JournalEntry[],
  isInPeriod: (date: string) => boolean,
  settings: { cost_of_sales_keywords: string[]; operating_expense_keywords: string[]; other_expense_keywords: string[] },
): ProfessionalIncomeStatement {
  const maps: Record<AccountClassification, Map<string, AccountDetail>> = {
    ingreso_operativo: new Map(),
    ingreso_operativo_devolucion: new Map(),
    ingreso_operativo_otro: new Map(),
    costo_ventas: new Map(),
    gasto_operativo: new Map(),
    gasto_operativo_da: new Map(),
    ingreso_financiero: new Map(),
    gasto_financiero: new Map(),
    extraordinario: new Map(),
    impuesto: new Map(),
    gasto_no_operativo: new Map(),
  };

  // Classify all income/expense accounts
  for (const a of accounts) {
    if (a.type !== 'INGRESO' && a.type !== 'GASTO') continue;
    const cls = classifyAccount(a, settings.cost_of_sales_keywords, settings.operating_expense_keywords, settings.other_expense_keywords);
    maps[cls].set(a.id, { id: a.id, name: a.name, amount: 0 });
  }

  // Accumulate from entries
  for (const e of entries) {
    if (!isInPeriod(e.date)) continue;
    for (const l of e.lines) {
      const a = accounts.find(x => x.id === l.account_id);
      if (!a || (a.type !== 'INGRESO' && a.type !== 'GASTO')) continue;

      const cls = classifyAccount(a, settings.cost_of_sales_keywords, settings.operating_expense_keywords, settings.other_expense_keywords);
      const detail = maps[cls].get(a.id);
      if (!detail) continue;

      if (a.type === 'INGRESO') {
        detail.amount += l.credit - l.debit;
      } else {
        detail.amount += l.debit - l.credit;
      }
    }
  }

  const filterAndSort = (map: Map<string, AccountDetail>) =>
    Array.from(map.values()).filter(x => x.amount !== 0).sort((a, b) => a.id.localeCompare(b.id));

  const ingresosOperativos = filterAndSort(maps.ingreso_operativo);
  const devoluciones = filterAndSort(maps.ingreso_operativo_devolucion);
  const otrosIngresosOperativos = filterAndSort(maps.ingreso_operativo_otro);
  const costoVentas = filterAndSort(maps.costo_ventas);
  const gastosOperativos = filterAndSort(maps.gasto_operativo);
  const depreciacionAmortizacion = filterAndSort(maps.gasto_operativo_da);
  const ingresosFinancieros = filterAndSort(maps.ingreso_financiero);
  const gastosFinancieros = filterAndSort(maps.gasto_financiero);
  const gastosNoOperativos = filterAndSort(maps.gasto_no_operativo);
  const extraordinarios = filterAndSort(maps.extraordinario);
  const impuestosCuentas = filterAndSort(maps.impuesto);

  const totalIngresosOp = round2(ingresosOperativos.reduce((s, x) => s + x.amount, 0));
  const totalDevoluciones = round2(devoluciones.reduce((s, x) => s + x.amount, 0));
  const ingresosNetos = round2(totalIngresosOp - totalDevoluciones);
  const totalOtrosIngOp = round2(otrosIngresosOperativos.reduce((s, x) => s + x.amount, 0));
  const totalIngresosOperativos = round2(ingresosNetos + totalOtrosIngOp);

  const totalCostoVentas = round2(costoVentas.reduce((s, x) => s + x.amount, 0));
  const utilidadBruta = round2(totalIngresosOperativos - totalCostoVentas);

  const totalGastosOpSinDA = round2(gastosOperativos.reduce((s, x) => s + x.amount, 0));
  const totalDA = round2(depreciacionAmortizacion.reduce((s, x) => s + x.amount, 0));
  const totalGastosOperativos = round2(totalGastosOpSinDA + totalDA);

  const ebitda = round2(utilidadBruta - totalGastosOpSinDA);
  const ebit = round2(utilidadBruta - totalGastosOperativos);

  const totalIngFin = round2(ingresosFinancieros.reduce((s, x) => s + x.amount, 0));
  const totalGasFin = round2(gastosFinancieros.reduce((s, x) => s + x.amount, 0));
  const totalGasNoOp = round2(gastosNoOperativos.reduce((s, x) => s + x.amount, 0));
  const resultadoFinanciero = round2(totalIngFin - totalGasFin - totalGasNoOp);

  const ebt = round2(ebit + resultadoFinanciero);

  const totalExtraordinarios = round2(extraordinarios.reduce((s, x) => s + x.amount, 0));
  const utilidadAntesImpuestos = round2(ebt - totalExtraordinarios);

  // Tax: only from classified tax accounts
  const impuesto = round2(impuestosCuentas.reduce((s, x) => s + x.amount, 0));

  const utilidadNeta = round2(utilidadAntesImpuestos - impuesto);

  const calcMargin = (v: number) => totalIngresosOperativos > 0 ? (v / totalIngresosOperativos) * 100 : 0;

  // Merge gasto_financiero and gasto_no_operativo into gastosFinancieros for display
  const allGastosFinancieros = [...gastosFinancieros, ...gastosNoOperativos];

  return {
    ingresosOperativos,
    devoluciones,
    ingresosNetos,
    otrosIngresosOperativos,
    totalIngresosOperativos,
    costoVentas,
    totalCostoVentas,
    utilidadBruta,
    margenBruto: calcMargin(utilidadBruta),
    gastosOperativos,
    depreciacionAmortizacion,
    totalGastosOperativosSinDA: totalGastosOpSinDA,
    totalDA,
    totalGastosOperativos,
    ebitda,
    margenEbitda: calcMargin(ebitda),
    ebit,
    margenOperativo: calcMargin(ebit),
    ingresosFinancieros,
    gastosFinancieros: allGastosFinancieros,
    resultadoFinanciero,
    ebt,
    extraordinarios,
    totalExtraordinarios,
    utilidadAntesImpuestos,
    impuestosCuentas,
    impuesto,
    utilidadNeta,
    margenNeto: calcMargin(utilidadNeta),
  };
}

export function IncomeStatementReport({
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
}: IncomeStatementReportProps) {
  const { settings } = useReportSettings();
  const [periodTypeLocal, setPeriodTypeLocal] = useState<PeriodType>('quarterly');
  const [selectedYearLocal, setSelectedYearLocal] = useState(nowInAppTZ().year);
  const [selectedMonthLocal, setSelectedMonthLocal] = useState('');

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
    if (periodType === 'monthly' && currentMonth) {
      return (date: string) => isDateInMonth(date, currentMonth);
    }
    if (periodType === 'quarterly') {
      return (date: string) => isDateInQuarter(date, currentQuarter);
    }
    return (date: string) => isDateInYear(date, selectedYear);
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const isInPreviousPeriod = useMemo(() => {
    if (periodType === 'monthly' && currentMonth) {
      // Previous month
      let py = currentMonth.year;
      let pm = currentMonth.month - 1;
      if (pm === 0) { pm = 12; py -= 1; }
      const prev = parseMonthString(`${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][pm-1]} ${py}`);
      return (date: string) => isDateInMonth(date, prev);
    }
    if (periodType === 'quarterly') {
      const prev = getPreviousQuarter(currentQuarter.year, currentQuarter.quarter);
      return (date: string) => isDateInQuarter(date, prev);
    }
    return (date: string) => isDateInYear(date, selectedYear - 1);
  }, [periodType, currentMonth, currentQuarter, selectedYear]);

  const current = useMemo(
    () => computeIncomeStatement(accounts, entries, isInPeriod, settings),
    [accounts, entries, isInPeriod, settings]
  );

  const previous = useMemo(
    () => computeIncomeStatement(accounts, entries, isInPreviousPeriod, settings),
    [accounts, entries, isInPreviousPeriod, settings]
  );

  const hasPreviousData = previous.totalIngresosOperativos !== 0 || previous.totalCostoVentas !== 0 || previous.totalGastosOperativos !== 0;

  const handleExportPDF = () => {
    const periodLabel = periodType === 'monthly' ? selectedMonth
      : periodType === 'quarterly' ? selectedQuarter
      : `Año ${selectedYear}`;
    exportIncomeStatementNIIFToPDF(current, periodLabel, hasPreviousData ? previous : undefined);
  };

  const MarginIndicator = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600 inline ml-1" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600 inline ml-1" />;
    return <Minus className="h-4 w-4 text-muted-foreground inline ml-1" />;
  };

  const fmtVar = (curr: number, prev: number) => {
    if (prev === 0) return '—';
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  const colSpanFull = hasPreviousData ? 5 : 4;

  const renderDetailRows = (items: AccountDetail[], prevItems?: AccountDetail[], isExpense = false) =>
    items.map(item => {
      const prevItem = prevItems?.find(p => p.id === item.id);
      return (
        <TableRow key={item.id}>
          <TableCell className="font-mono text-xs">{item.id}</TableCell>
          <TableCell>{item.name}</TableCell>
          <TableCell className={`text-right ${isExpense ? 'text-red-600' : ''}`}>
            {isExpense ? `(${fmt(item.amount)})` : fmt(item.amount)}
          </TableCell>
          {hasPreviousData && (
            <>
              <TableCell className={`text-right text-muted-foreground ${isExpense ? 'text-red-400' : ''}`}>
                {prevItem ? (isExpense ? `(${fmt(prevItem.amount)})` : fmt(prevItem.amount)) : '—'}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {prevItem ? fmtVar(item.amount, prevItem.amount) : '—'}
              </TableCell>
            </>
          )}
        </TableRow>
      );
    });

  const renderHighlightRow = (label: string, value: number, margin?: number, bgClass = 'bg-blue-100 dark:bg-blue-950/50', prevValue?: number) => (
    <TableRow className={`${bgClass} font-semibold`}>
      <TableCell colSpan={2} className="text-right font-bold">{label}</TableCell>
      <TableCell className={`text-right font-bold ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {fmt(value)}
      </TableCell>
      {hasPreviousData && (
        <>
          <TableCell className="text-right font-bold text-muted-foreground">
            {prevValue !== undefined ? fmt(prevValue) : '—'}
          </TableCell>
          <TableCell className="text-right text-xs">
            {prevValue !== undefined ? fmtVar(value, prevValue) : '—'}
          </TableCell>
        </>
      )}
    </TableRow>
  );

  const renderSubtotalRow = (label: string, value: number, bgClass: string, prevValue?: number, isExpense = true) => (
    <TableRow className={bgClass}>
      <TableCell colSpan={2} className="text-right font-semibold">{label}</TableCell>
      <TableCell className={`text-right font-semibold ${isExpense ? 'text-red-600' : ''}`}>
        {isExpense ? `(${fmt(value)})` : fmt(value)}
      </TableCell>
      {hasPreviousData && (
        <>
          <TableCell className="text-right font-semibold text-muted-foreground">
            {prevValue !== undefined ? (isExpense ? `(${fmt(prevValue)})` : fmt(prevValue)) : '—'}
          </TableCell>
          <TableCell className="text-right text-xs text-muted-foreground">
            {prevValue !== undefined ? fmtVar(value, prevValue) : '—'}
          </TableCell>
        </>
      )}
    </TableRow>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Estado de Resultados (NIIF)</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-2" />
          Exportar PDF
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Periodo Actual</TableHead>
                {hasPreviousData && (
                  <>
                    <TableHead className="text-right">Periodo Anterior</TableHead>
                    <TableHead className="text-right w-24">Variación</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 1. INGRESOS OPERATIVOS */}
              <TableRow className="bg-green-50 dark:bg-green-950/30">
                <TableCell colSpan={colSpanFull} className="font-semibold text-green-700 dark:text-green-400">
                  1. INGRESOS OPERATIVOS
                </TableCell>
              </TableRow>
              {renderDetailRows(current.ingresosOperativos, previous.ingresosOperativos)}

              {current.devoluciones.length > 0 && (
                <>
                  <TableRow className="bg-green-50/50 dark:bg-green-950/20">
                    <TableCell colSpan={colSpanFull} className="font-medium text-green-600 dark:text-green-500 text-sm pl-8">
                      (-) Devoluciones
                    </TableCell>
                  </TableRow>
                  {renderDetailRows(current.devoluciones, previous.devoluciones, true)}
                </>
              )}

              {current.otrosIngresosOperativos.length > 0 && (
                <>
                  <TableRow className="bg-green-50/50 dark:bg-green-950/20">
                    <TableCell colSpan={colSpanFull} className="font-medium text-green-600 dark:text-green-500 text-sm pl-8">
                      Otros Ingresos Operativos
                    </TableCell>
                  </TableRow>
                  {renderDetailRows(current.otrosIngresosOperativos, previous.otrosIngresosOperativos)}
                </>
              )}

              {renderSubtotalRow('Total Ingresos Operativos', current.totalIngresosOperativos, 'bg-green-100 dark:bg-green-950/50', previous.totalIngresosOperativos, false)}

              {/* 2. COSTO DE VENTAS */}
              <TableRow className="bg-orange-50 dark:bg-orange-950/30">
                <TableCell colSpan={colSpanFull} className="font-semibold text-orange-700 dark:text-orange-400">
                  2. (-) COSTO DE VENTAS
                </TableCell>
              </TableRow>
              {renderDetailRows(current.costoVentas, previous.costoVentas, true)}
              {current.costoVentas.length > 0 &&
                renderSubtotalRow('Total Costo de Ventas', current.totalCostoVentas, 'bg-orange-100 dark:bg-orange-950/50', previous.totalCostoVentas)}

              {/* UTILIDAD BRUTA */}
              {renderHighlightRow('UTILIDAD BRUTA', current.utilidadBruta, current.margenBruto, 'bg-blue-100 dark:bg-blue-950/50', previous.utilidadBruta)}

              {/* 3. GASTOS OPERATIVOS */}
              <TableRow className="bg-purple-50 dark:bg-purple-950/30">
                <TableCell colSpan={colSpanFull} className="font-semibold text-purple-700 dark:text-purple-400">
                  3. (-) GASTOS OPERATIVOS
                </TableCell>
              </TableRow>
              {renderDetailRows(current.gastosOperativos, previous.gastosOperativos, true)}

              {current.depreciacionAmortizacion.length > 0 && (
                <>
                  <TableRow className="bg-purple-50/50 dark:bg-purple-950/20">
                    <TableCell colSpan={colSpanFull} className="font-medium text-purple-600 dark:text-purple-400 text-sm pl-8">
                      Depreciación y Amortización
                    </TableCell>
                  </TableRow>
                  {renderDetailRows(current.depreciacionAmortizacion, previous.depreciacionAmortizacion, true)}
                </>
              )}
              {(current.gastosOperativos.length > 0 || current.depreciacionAmortizacion.length > 0) &&
                renderSubtotalRow('Total Gastos Operativos', current.totalGastosOperativos, 'bg-purple-100 dark:bg-purple-950/50', previous.totalGastosOperativos)}

              {/* EBITDA */}
              {renderHighlightRow('EBITDA', current.ebitda, current.margenEbitda, 'bg-cyan-100 dark:bg-cyan-950/50', previous.ebitda)}

              {/* EBIT */}
              {renderHighlightRow('EBIT (Resultado Operativo)', current.ebit, current.margenOperativo, 'bg-blue-100 dark:bg-blue-950/50', previous.ebit)}

              {/* 4. RESULTADO FINANCIERO */}
              {(current.ingresosFinancieros.length > 0 || current.gastosFinancieros.length > 0) && (
                <>
                  <TableRow className="bg-slate-50 dark:bg-slate-950/30">
                    <TableCell colSpan={colSpanFull} className="font-semibold text-slate-700 dark:text-slate-400">
                      4. RESULTADO FINANCIERO
                    </TableCell>
                  </TableRow>
                  {current.ingresosFinancieros.length > 0 && (
                    <>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-950/20">
                        <TableCell colSpan={colSpanFull} className="font-medium text-slate-600 text-sm pl-8">
                          (+) Ingresos Financieros
                        </TableCell>
                      </TableRow>
                      {renderDetailRows(current.ingresosFinancieros, previous.ingresosFinancieros)}
                    </>
                  )}
                  {current.gastosFinancieros.length > 0 && (
                    <>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-950/20">
                        <TableCell colSpan={colSpanFull} className="font-medium text-slate-600 text-sm pl-8">
                          (-) Gastos Financieros
                        </TableCell>
                      </TableRow>
                      {renderDetailRows(current.gastosFinancieros, previous.gastosFinancieros, true)}
                    </>
                  )}
                  {renderSubtotalRow(
                    'Resultado Financiero',
                    current.resultadoFinanciero,
                    'bg-slate-100 dark:bg-slate-950/50',
                    previous.resultadoFinanciero,
                    current.resultadoFinanciero < 0
                  )}
                </>
              )}

              {/* EBT */}
              {renderHighlightRow('EBT (Resultado antes de Impuestos)', current.ebt, undefined, 'bg-amber-100 dark:bg-amber-950/50', previous.ebt)}

              {/* 5. PARTIDAS EXTRAORDINARIAS */}
              {current.extraordinarios.length > 0 && (
                <>
                  <TableRow className="bg-gray-50 dark:bg-gray-950/30">
                    <TableCell colSpan={colSpanFull} className="font-semibold text-gray-700 dark:text-gray-400">
                      5. (-) PARTIDAS EXTRAORDINARIAS
                    </TableCell>
                  </TableRow>
                  {renderDetailRows(current.extraordinarios, previous.extraordinarios, true)}
                  {renderSubtotalRow('Total Extraordinarios', current.totalExtraordinarios, 'bg-gray-100 dark:bg-gray-950/50', previous.totalExtraordinarios)}
                </>
              )}

              {/* 6. IMPUESTOS */}
              {current.impuestosCuentas.length > 0 && (
                <>
                  <TableRow className="bg-red-50 dark:bg-red-950/30">
                    <TableCell colSpan={colSpanFull} className="font-semibold text-red-700 dark:text-red-400">
                      6. (-) IMPUESTOS
                    </TableCell>
                  </TableRow>
                  {renderDetailRows(current.impuestosCuentas, previous.impuestosCuentas, true)}
                  {renderSubtotalRow('Total Impuestos', current.impuesto, 'bg-red-100 dark:bg-red-950/50', previous.impuesto)}
                </>
              )}

              {/* UTILIDAD NETA */}
              <TableRow className="bg-muted font-bold">
                <TableCell colSpan={2} className="text-right text-lg font-bold">UTILIDAD NETA</TableCell>
                <TableCell className={`text-right text-lg font-bold ${current.utilidadNeta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(current.utilidadNeta)}
                </TableCell>
                {hasPreviousData && (
                  <>
                    <TableCell className="text-right font-bold text-muted-foreground">
                      {fmt(previous.utilidadNeta)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtVar(current.utilidadNeta, previous.utilidadNeta)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Resumen de Márgenes */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Margen Bruto</div>
              <div className={`text-2xl font-bold ${current.margenBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {current.margenBruto.toFixed(1)}%
                <MarginIndicator value={current.margenBruto} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 dark:border-cyan-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Margen EBITDA</div>
              <div className={`text-2xl font-bold ${current.margenEbitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {current.margenEbitda.toFixed(1)}%
                <MarginIndicator value={current.margenEbitda} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 dark:border-purple-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Margen Operativo (EBIT)</div>
              <div className={`text-2xl font-bold ${current.margenOperativo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {current.margenOperativo.toFixed(1)}%
                <MarginIndicator value={current.margenOperativo} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Margen Neto</div>
              <div className={`text-2xl font-bold ${current.margenNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {current.margenNeto.toFixed(1)}%
                <MarginIndicator value={current.margenNeto} />
              </div>
            </CardContent>
          </Card>
        </div>

        {hasPreviousData && (
          <div className="text-xs text-muted-foreground mt-2">
            📊 Comparativo: {periodType === 'monthly'
              ? `${selectedMonth} vs mes anterior`
              : periodType === 'quarterly'
                ? `${selectedQuarter} vs ${getPreviousQuarter(currentQuarter.year, currentQuarter.quarter).label}`
                : `${selectedYear} vs ${selectedYear - 1}`
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
}
