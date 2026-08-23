// src/components/reports/BalanceSheetReport.tsx
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileDown, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { Account, JournalEntry } from '@/accounting/types';
import { signedBalanceFor, fmt, round2 } from '@/accounting/utils';
import { useReportSum, SumToggleButton, RowCheck, SumBar } from './useReportSum';
import { getFiscalYearBounds, computePeriodResult, findUtilidadesAcumuladasAccount } from '@/accounting/fiscal-year-utils';
import { exportBalanceSheetNIIFToPDF, BalanceSheetNIIFData, previewNextPdf } from '@/services/pdfService';

interface BalanceSheetReportProps {
  accounts: Account[];
  entries: JournalEntry[];
  bsDate: string;
  onBsDateChange: (date: string) => void;
}

interface AccountBalance {
  id: string;
  name: string;
  balance: number;
}

// Classify assets/liabilities as current or non-current
function isCurrentAsset(account: Account): boolean {
  if (account.is_current === true) return true;
  if (account.is_current === false) return false;
  const currentKeywords = [
    'caja', 'banco', 'efectivo', 'cobrar', 'inventario', 'mercaderia', 'mercadería',
    'anticipo', 'prepago', 'iva', 'crédito fiscal', 'credito fiscal', 'usdt', 'cripto'
  ];
  const lowerName = account.name.toLowerCase();
  return currentKeywords.some(k => lowerName.includes(k));
}

function isCurrentLiability(account: Account): boolean {
  if (account.is_current === true) return true;
  if (account.is_current === false) return false;
  const currentKeywords = [
    'pagar', 'proveedor', 'acreedor', 'iva', 'débito fiscal', 'debito fiscal',
    'impuesto', 'sueldo', 'salario', 'corto plazo', 'anticipo'
  ];
  const lowerName = account.name.toLowerCase();
  return currentKeywords.some(k => lowerName.includes(k));
}

interface BalanceSheetNIIF {
  activosCorrientes: AccountBalance[];
  totalActivosCorrientes: number;
  activosNoCorrientes: AccountBalance[];
  totalActivosNoCorrientes: number;
  totalActivo: number;
  pasivosCorrientes: AccountBalance[];
  totalPasivosCorrientes: number;
  pasivosNoCorrientes: AccountBalance[];
  totalPasivosNoCorrientes: number;
  totalPasivo: number;
  // Equity — split into three conceptual layers to avoid double-counting:
  // 1. patrimonioDetalle: all PATRIMONIO accounts EXCEPT Pn.2 (UA)
  // 2. utilidadesAcumuladasDesplegado: real balance of Pn.2 + prior-year I-G results
  // 3. resultadoEjercicio: current fiscal-year I-G result only
  patrimonioDetalle: AccountBalance[];
  utilidadesAcumuladasDesplegado: number;
  resultadoEjercicio: number;
  fiscalYear: number;
  totalPatrimonio: number;
  check: number;
  razonCorriente: number | null;
  razonEndeudamiento: number;
  capitalTrabajo: number;
}

export function BalanceSheetReport({
  accounts,
  entries,
  bsDate,
  onBsDateChange,
}: BalanceSheetReportProps) {
  const balanceSheet = useMemo<BalanceSheetNIIF>(() => {
    // --- Fiscal year bounds for bsDate (calendar year) ---
    const fyBounds = getFiscalYearBounds(bsDate);
    const fiscalYearStart = fyBounds.start;  // e.g. "2026-01-01"
    const priorYearEnd    = `${fyBounds.year - 1}-12-31`;

    // --- Identify the "Utilidades Acumuladas" account (Pn.2) ---
    const uaAccount = findUtilidadesAcumuladasAccount(accounts);
    const uaAccountId = uaAccount?.id;

    // --- Build maps, excluding Pn.2 from patrimonioMap to avoid double-count ---
    const activosCorrientesMap    = new Map<string, AccountBalance>();
    const activosNoCorrientesMap  = new Map<string, AccountBalance>();
    const pasivosCorrientesMap    = new Map<string, AccountBalance>();
    const pasivosNoCorrientesMap  = new Map<string, AccountBalance>();
    const patrimonioMap           = new Map<string, AccountBalance>();

    for (const a of accounts) {
      const entry = { id: a.id, name: a.name, balance: 0 };
      if (a.type === 'ACTIVO') {
        isCurrentAsset(a) ? activosCorrientesMap.set(a.id, entry) : activosNoCorrientesMap.set(a.id, entry);
      } else if (a.type === 'PASIVO') {
        isCurrentLiability(a) ? pasivosCorrientesMap.set(a.id, entry) : pasivosNoCorrientesMap.set(a.id, entry);
      } else if (a.type === 'PATRIMONIO' && a.id !== uaAccountId) {
        // Pn.2 is excluded here; its value is displayed separately as utilidadesAcumuladasDesplegado
        patrimonioMap.set(a.id, entry);
      }
    }

    // --- Calculate balances per ACTIVO/PASIVO/PATRIMONIO account until bsDate ---
    let saldoRealCuentaUA = 0;

    for (const a of accounts) {
      let bal = 0;
      for (const e of entries) {
        if (e.date > bsDate) continue;
        for (const l of e.lines) {
          if (l.account_id !== a.id) continue;
          bal += signedBalanceFor(l.debit, l.credit, a.normal_side);
        }
      }
      const roundedBal = round2(bal);

      if (a.type === 'ACTIVO') {
        const map = isCurrentAsset(a) ? activosCorrientesMap : activosNoCorrientesMap;
        const acc = map.get(a.id);
        if (acc) acc.balance = roundedBal;
      } else if (a.type === 'PASIVO') {
        const map = isCurrentLiability(a) ? pasivosCorrientesMap : pasivosNoCorrientesMap;
        const acc = map.get(a.id);
        if (acc) acc.balance = roundedBal;
      } else if (a.type === 'PATRIMONIO') {
        if (a.id === uaAccountId) {
          // Capture real Pn.2 balance separately
          saldoRealCuentaUA = roundedBal;
        } else {
          const acc = patrimonioMap.get(a.id);
          if (acc) acc.balance = roundedBal;
        }
      }
    }

    // --- I-G split: current year vs prior years ---
    // Current year: entries from fiscalYearStart to bsDate
    const currentYearResult = computePeriodResult(accounts, entries, fiscalYearStart, bsDate);
    const resultadoEjercicio = currentYearResult.resultado;

    // Prior years: all entries before this fiscal year started
    // Only computed if there are entries before the year boundary
    let utilidadesAcumuladasDeAniosAnteriores = 0;
    if (priorYearEnd >= '2000-01-01') {  // sanity guard
      const priorResult = computePeriodResult(accounts, entries, '0001-01-01', priorYearEnd);
      utilidadesAcumuladasDeAniosAnteriores = priorResult.resultado;
    }

    // utilidadesAcumuladasDesplegado = real Pn.2 balance + prior I-G results
    // The real Pn.2 balance captures manual journal entries (dividends, adjustments).
    // Prior I-G results capture the economic accumulation not yet formally reclassified.
    const utilidadesAcumuladasDesplegado = round2(saldoRealCuentaUA + utilidadesAcumuladasDeAniosAnteriores);

    // --- Filter and sort ---
    const filterAndSort = (map: Map<string, AccountBalance>) =>
      Array.from(map.values())
        .filter(x => x.balance !== 0)
        .sort((a, b) => a.id.localeCompare(b.id));

    const activosCorrientes    = filterAndSort(activosCorrientesMap);
    const activosNoCorrientes  = filterAndSort(activosNoCorrientesMap);
    const pasivosCorrientes    = filterAndSort(pasivosCorrientesMap);
    const pasivosNoCorrientes  = filterAndSort(pasivosNoCorrientesMap);
    const patrimonioDetalle    = filterAndSort(patrimonioMap);

    // --- Totals ---
    const totalActivosCorrientes   = round2(activosCorrientes.reduce((s, x) => s + x.balance, 0));
    const totalActivosNoCorrientes = round2(activosNoCorrientes.reduce((s, x) => s + x.balance, 0));
    const totalActivo              = round2(totalActivosCorrientes + totalActivosNoCorrientes);

    const totalPasivosCorrientes   = round2(pasivosCorrientes.reduce((s, x) => s + x.balance, 0));
    const totalPasivosNoCorrientes = round2(pasivosNoCorrientes.reduce((s, x) => s + x.balance, 0));
    const totalPasivo              = round2(totalPasivosCorrientes + totalPasivosNoCorrientes);

    // totalPatrimonioContable: only the explicitly listed accounts (no Pn.2, no I-G)
    const totalPatrimonioContable = round2(patrimonioDetalle.reduce((s, x) => s + x.balance, 0));
    // totalPatrimonio = contable + UA desplegado + resultado ejercicio
    const totalPatrimonio = round2(totalPatrimonioContable + utilidadesAcumuladasDesplegado + resultadoEjercicio);

    const razonCorriente = totalPasivosCorrientes > 0
      ? totalActivosCorrientes / totalPasivosCorrientes
      : null;
    const razonEndeudamiento = totalActivo > 0 ? (totalPasivo / totalActivo) * 100 : 0;
    const capitalTrabajo = round2(totalActivosCorrientes - totalPasivosCorrientes);

    return {
      activosCorrientes,
      totalActivosCorrientes,
      activosNoCorrientes,
      totalActivosNoCorrientes,
      totalActivo,
      pasivosCorrientes,
      totalPasivosCorrientes,
      pasivosNoCorrientes,
      totalPasivosNoCorrientes,
      totalPasivo,
      patrimonioDetalle,
      utilidadesAcumuladasDesplegado,
      resultadoEjercicio,
      fiscalYear: fyBounds.year,
      totalPatrimonio,
      check: round2(totalActivo - (totalPasivo + totalPatrimonio)),
      razonCorriente,
      razonEndeudamiento,
      capitalTrabajo,
    };
  }, [accounts, entries, bsDate]);

  // ── Selección y suma en tabla (inline, sin popup) ──
  const sel = useReportSum();
  const selectableRows = useMemo(() => [
    ...balanceSheet.activosCorrientes,
    ...balanceSheet.activosNoCorrientes,
    ...balanceSheet.pasivosCorrientes,
    ...balanceSheet.pasivosNoCorrientes,
    ...balanceSheet.patrimonioDetalle,
    { id: 'Pn.2', name: 'Utilidades Acumuladas', balance: balanceSheet.utilidadesAcumuladasDesplegado },
  ].map(r => ({ id: r.id, value: r.balance })), [balanceSheet]);
  const resumenSel = sel.sumOf(selectableRows);

  const handleExportPDF = (mode: 'save' | 'view' = 'save') => {
    const pdfData: BalanceSheetNIIFData = {
      activosCorrientes: balanceSheet.activosCorrientes,
      totalActivosCorrientes: balanceSheet.totalActivosCorrientes,
      activosNoCorrientes: balanceSheet.activosNoCorrientes,
      totalActivosNoCorrientes: balanceSheet.totalActivosNoCorrientes,
      totalActivo: balanceSheet.totalActivo,
      pasivosCorrientes: balanceSheet.pasivosCorrientes,
      totalPasivosCorrientes: balanceSheet.totalPasivosCorrientes,
      pasivosNoCorrientes: balanceSheet.pasivosNoCorrientes,
      totalPasivosNoCorrientes: balanceSheet.totalPasivosNoCorrientes,
      totalPasivo: balanceSheet.totalPasivo,
      patrimonioDetalle: balanceSheet.patrimonioDetalle,
      utilidadesAcumuladasDesplegado: balanceSheet.utilidadesAcumuladasDesplegado,
      resultadoEjercicio: balanceSheet.resultadoEjercicio,
      fiscalYear: balanceSheet.fiscalYear,
      totalPatrimonio: balanceSheet.totalPatrimonio,
      razonCorriente: balanceSheet.razonCorriente,
      razonEndeudamiento: balanceSheet.razonEndeudamiento,
      capitalTrabajo: balanceSheet.capitalTrabajo,
    };
    const run = () => exportBalanceSheetNIIFToPDF(pdfData, bsDate);
    if (mode === 'view') previewNextPdf(run); else run();
  };

  const renderAccountSection = (
    title: string,
    accounts: AccountBalance[],
    total: number,
    colorClass: string,
    bgClass: string,
    showSubtotal: boolean = true
  ) => (
    <>
      <TableRow className={bgClass}>
        <TableCell colSpan={3} className={`font-semibold ${colorClass}`}>
          {title}
        </TableCell>
      </TableRow>
      {accounts.map(acc => {
        const s = sel.isSel(acc.id);
        return (
          <TableRow
            key={acc.id}
            className={`${sel.active ? 'cursor-pointer' : ''} ${s ? 'bg-primary/10' : ''}`}
            onClick={sel.active ? () => sel.toggle(acc.id) : undefined}
          >
            <TableCell className="font-mono text-xs">{acc.id}</TableCell>
            <TableCell className="text-sm">
              {sel.active && <RowCheck checked={s} onToggle={() => sel.toggle(acc.id)} label={acc.name} />}
              {acc.name}
            </TableCell>
            <TableCell className="text-right text-sm">{fmt(acc.balance)}</TableCell>
          </TableRow>
        );
      })}
      {showSubtotal && accounts.length > 0 && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={2} className="text-right font-medium text-sm">
            Subtotal
          </TableCell>
          <TableCell className="text-right font-medium text-sm">{fmt(total)}</TableCell>
        </TableRow>
      )}
    </>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Balance General (NIIF)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Estado de Situación Financiera</p>
        </div>
        <div className="flex items-center gap-2">
          <SumToggleButton active={sel.active} onToggle={() => (sel.active ? sel.close() : sel.setActive(true))} />
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
        <div className="w-full max-w-xs">
          <Label>Fecha de corte:</Label>
          <Input type="date" value={bsDate} onChange={e => onBsDateChange(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground">Al: {bsDate}</div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: ASSETS */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderAccountSection(
                  'ACTIVOS CORRIENTES',
                  balanceSheet.activosCorrientes,
                  balanceSheet.totalActivosCorrientes,
                  'text-blue-700 dark:text-blue-400',
                  'bg-blue-50 dark:bg-blue-950/30'
                )}
                {renderAccountSection(
                  'ACTIVOS NO CORRIENTES',
                  balanceSheet.activosNoCorrientes,
                  balanceSheet.totalActivosNoCorrientes,
                  'text-indigo-700 dark:text-indigo-400',
                  'bg-indigo-50 dark:bg-indigo-950/30'
                )}
                <TableRow className="bg-muted">
                  <TableCell colSpan={2} className="text-right font-bold">
                    Total Activos
                  </TableCell>
                  <TableCell className="text-right font-bold">{fmt(balanceSheet.totalActivo)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Right Column: LIABILITIES + EQUITY */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderAccountSection(
                  'PASIVOS CORRIENTES',
                  balanceSheet.pasivosCorrientes,
                  balanceSheet.totalPasivosCorrientes,
                  'text-orange-700 dark:text-orange-400',
                  'bg-orange-50 dark:bg-orange-950/30'
                )}
                {renderAccountSection(
                  'PASIVOS NO CORRIENTES',
                  balanceSheet.pasivosNoCorrientes,
                  balanceSheet.totalPasivosNoCorrientes,
                  'text-amber-700 dark:text-amber-400',
                  'bg-amber-50 dark:bg-amber-950/30'
                )}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={2} className="text-right font-semibold">
                    Total Pasivos
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(balanceSheet.totalPasivo)}</TableCell>
                </TableRow>

                {/* EQUITY */}
                <TableRow className="bg-purple-50 dark:bg-purple-950/30">
                  <TableCell colSpan={3} className="font-semibold text-purple-700 dark:text-purple-400">
                    PATRIMONIO
                  </TableCell>
                </TableRow>
                {balanceSheet.patrimonioDetalle.map(pat => {
                  const s = sel.isSel(pat.id);
                  return (
                    <TableRow
                      key={pat.id}
                      className={`${sel.active ? 'cursor-pointer' : ''} ${s ? 'bg-primary/10' : ''}`}
                      onClick={sel.active ? () => sel.toggle(pat.id) : undefined}
                    >
                      <TableCell className="font-mono text-xs">{pat.id}</TableCell>
                      <TableCell className="text-sm">
                        {sel.active && <RowCheck checked={s} onToggle={() => sel.toggle(pat.id)} label={pat.name} />}
                        {pat.name}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt(pat.balance)}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Utilidades Acumuladas (saldo Pn.2 + resultados I-G de años anteriores) */}
                <TableRow
                  className={`${sel.active ? 'cursor-pointer' : ''} ${sel.isSel('Pn.2') ? 'bg-primary/10' : ''}`}
                  onClick={sel.active ? () => sel.toggle('Pn.2') : undefined}
                >
                  <TableCell className="font-mono text-xs">Pn.2</TableCell>
                  <TableCell className="font-medium text-sm">
                    {sel.active && <RowCheck checked={sel.isSel('Pn.2')} onToggle={() => sel.toggle('Pn.2')} label="Utilidades Acumuladas" />}
                    Utilidades Acumuladas
                  </TableCell>
                  <TableCell className={`text-right font-medium text-sm ${balanceSheet.utilidadesAcumuladasDesplegado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(balanceSheet.utilidadesAcumuladasDesplegado)}
                  </TableCell>
                </TableRow>
                {/* Resultado del Ejercicio — solo el año fiscal de bsDate */}
                <TableRow>
                  <TableCell className="font-mono text-xs">—</TableCell>
                  <TableCell className="font-medium text-sm">
                    Resultado del Ejercicio {balanceSheet.fiscalYear}
                  </TableCell>
                  <TableCell className={`text-right font-medium text-sm ${balanceSheet.resultadoEjercicio >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(balanceSheet.resultadoEjercicio)}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={2} className="text-right font-semibold">
                    Total Patrimonio
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(balanceSheet.totalPatrimonio)}</TableCell>
                </TableRow>

                <TableRow className="bg-muted">
                  <TableCell colSpan={2} className="text-right font-bold">
                    Total Pasivo + Patrimonio
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {fmt(balanceSheet.totalPasivo + balanceSheet.totalPatrimonio)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Barra de suma de las cuentas seleccionadas (inline, sin popup) */}
        {sel.active && (
          <SumBar count={resumenSel.count} sum={resumenSel.sum} onClear={sel.clear} label="Suma de saldos" />
        )}

        {/* Verification */}
        <div
          className={'text-sm font-medium ' + (balanceSheet.check === 0 ? 'text-green-600' : 'text-red-600')}
        >
          Ecuación contable: Activos - (Pasivo + Patrimonio) ={' '}
          <span className="font-semibold">{fmt(balanceSheet.check)}</span>
          {balanceSheet.check === 0 ? ' ✓ Cuadra' : ' ✗ No cuadra'}
        </div>

        {/* Financial Ratios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Razón Corriente</div>
              <div className={`text-2xl font-bold flex items-center gap-2 ${
                balanceSheet.razonCorriente !== null && balanceSheet.razonCorriente >= 1
                  ? 'text-green-600'
                  : 'text-amber-600'
              }`}>
                {balanceSheet.razonCorriente !== null
                  ? `${balanceSheet.razonCorriente.toFixed(2)}x`
                  : 'N/A'}
                {balanceSheet.razonCorriente !== null && balanceSheet.razonCorriente >= 1
                  ? <TrendingUp className="h-5 w-5" />
                  : balanceSheet.razonCorriente !== null && <TrendingDown className="h-5 w-5" />}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Activo Corriente / Pasivo Corriente
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 dark:border-orange-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Razón de Endeudamiento</div>
              <div className={`text-2xl font-bold ${
                balanceSheet.razonEndeudamiento <= 50 ? 'text-green-600' : 'text-amber-600'
              }`}>
                {balanceSheet.razonEndeudamiento.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Pasivo Total / Activo Total
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Capital de Trabajo</div>
              <div className={`text-2xl font-bold ${
                balanceSheet.capitalTrabajo >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {fmt(balanceSheet.capitalTrabajo)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Activo Corriente - Pasivo Corriente
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
