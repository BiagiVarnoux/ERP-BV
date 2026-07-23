// src/components/shared/PeriodFilterBar.tsx
// Shared period filter (Últimos 30 días / Mensual / Trimestral / Anual) used by
// Dashboard and Sales — mirrors the period types used in Reportes (period-utils.ts)
// plus a quick "last 30 days" option.
import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PeriodType,
  getAllMonthsFromStart,
  getAvailableYears,
  getCurrentMonth,
  resolvePeriod,
} from '@/accounting/period-utils';
import { getCurrentQuarter, getAllQuartersFromStart } from '@/accounting/quarterly-utils';
import { nowInAppTZ } from '@/accounting/utils';

export type ExtendedPeriodType = 'last30' | PeriodType;

export interface PeriodFilterValue {
  type: ExtendedPeriodType;
  month: string;
  quarter: string;
  year: number;
}

export function getDefaultPeriodFilterValue(): PeriodFilterValue {
  return {
    type: 'monthly',
    month: getCurrentMonth().label,
    quarter: getCurrentQuarter().label,
    year: nowInAppTZ().year,
  };
}

export function resolvePeriodFilterRange(v: PeriodFilterValue): { startDate: string; endDate: string } {
  if (v.type === 'last30') {
    const { year, month, day } = nowInAppTZ();
    const cutoff = new Date(year, month - 1, day - 30);
    const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const todayISOStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { startDate: cutoffISO, endDate: todayISOStr };
  }
  const value = v.type === 'monthly' ? v.month : v.type === 'quarterly' ? v.quarter : String(v.year);
  const resolved = resolvePeriod({ type: v.type, value });
  return { startDate: resolved.startDate, endDate: resolved.endDate };
}

export function isDateInPeriodFilter(date: string, v: PeriodFilterValue): boolean {
  const { startDate, endDate } = resolvePeriodFilterRange(v);
  return date >= startDate && date <= endDate;
}

const PERIOD_TABS: { value: ExtendedPeriodType; label: string }[] = [
  { value: 'last30', label: 'Últimos 30 días' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annual', label: 'Anual' },
];

interface PeriodFilterBarProps {
  value: PeriodFilterValue;
  onChange: (v: PeriodFilterValue) => void;
}

export function PeriodFilterBar({ value, onChange }: PeriodFilterBarProps) {
  const availableMonths = useMemo(() => getAllMonthsFromStart(2020), []);
  const availableQuarters = useMemo(() => getAllQuartersFromStart(2020), []);
  const availableYears = useMemo(() => getAvailableYears(), []);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Tabs value={value.type} onValueChange={(v) => onChange({ ...value, type: v as ExtendedPeriodType })} className="w-full sm:w-auto">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto sm:h-10 w-full sm:w-[440px]">
          {PERIOD_TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {value.type === 'monthly' && (
        <Select value={value.month} onValueChange={(m) => onChange({ ...value, month: m })}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Seleccionar mes" /></SelectTrigger>
          <SelectContent>
            {availableMonths.map(m => <SelectItem key={m.label} value={m.label}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'quarterly' && (
        <Select value={value.quarter} onValueChange={(q) => onChange({ ...value, quarter: q })}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Seleccionar trimestre" /></SelectTrigger>
          <SelectContent>
            {availableQuarters.map(q => <SelectItem key={q.label} value={q.label}>{q.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'annual' && (
        <Select value={String(value.year)} onValueChange={(y) => onChange({ ...value, year: parseInt(y, 10) })}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Seleccionar año" /></SelectTrigger>
          <SelectContent>
            {availableYears.map(y => <SelectItem key={y.year} value={String(y.year)}>{y.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
