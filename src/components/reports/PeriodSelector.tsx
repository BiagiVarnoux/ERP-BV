// src/components/reports/PeriodSelector.tsx
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Quarter } from '@/accounting/quarterly-utils';
import {
  PeriodType,
  YearPeriod,
  MonthPeriod,
  getAllMonthsFromStart,
  getAvailableYears,
  getYearPeriod,
  isDateInYear,
  parseMonthString,
} from '@/accounting/period-utils';

// Re-export so existing imports keep working
export type { PeriodType, YearPeriod, MonthPeriod };
export { getYearPeriod, isDateInYear, getAvailableYears };

interface PeriodSelectorProps {
  periodType: PeriodType;
  onPeriodTypeChange: (type: PeriodType) => void;

  selectedQuarter: string;
  onQuarterChange: (quarter: string) => void;

  selectedYear: number;
  onYearChange: (year: number) => void;

  // New: monthly support
  selectedMonth?: string; // e.g. "Abril 2026"
  onMonthChange?: (label: string) => void;

  availableQuarters: Quarter[];
  showPeriodInfo?: boolean;
  currentQuarter?: Quarter;
  currentYear?: YearPeriod;
}

export function PeriodSelector({
  periodType,
  onPeriodTypeChange,
  selectedQuarter,
  onQuarterChange,
  selectedYear,
  onYearChange,
  selectedMonth,
  onMonthChange,
  availableQuarters,
  showPeriodInfo = true,
  currentQuarter,
  currentYear,
}: PeriodSelectorProps) {
  const availableYears = React.useMemo(() => getAvailableYears(), []);
  const availableMonths = React.useMemo(() => getAllMonthsFromStart(2020), []);

  const currentMonth = React.useMemo(() => {
    if (periodType !== 'monthly' || !selectedMonth) return null;
    try { return parseMonthString(selectedMonth); } catch { return null; }
  }, [periodType, selectedMonth]);

  return (
    <div className="space-y-4">
      {/* Period Type Toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <Label className="text-sm font-medium">Tipo de período:</Label>
        <Tabs value={periodType} onValueChange={(v) => onPeriodTypeChange(v as PeriodType)} className="w-full sm:w-auto">
          <TabsList className="grid w-full sm:w-[360px] grid-cols-3">
            <TabsTrigger value="monthly">Mensual</TabsTrigger>
            <TabsTrigger value="quarterly">Trimestral</TabsTrigger>
            <TabsTrigger value="annual">Anual</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-4 flex-wrap">
        {periodType === 'monthly' && (
          <Select
            value={selectedMonth || ''}
            onValueChange={(v) => onMonthChange?.(v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m.label} value={m.label}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {periodType === 'quarterly' && (
          <Select value={selectedQuarter} onValueChange={onQuarterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar trimestre" />
            </SelectTrigger>
            <SelectContent>
              {availableQuarters.map((q) => (
                <SelectItem key={q.label} value={q.label}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {periodType === 'annual' && (
          <Select
            value={selectedYear.toString()}
            onValueChange={(v) => onYearChange(parseInt(v))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar año" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y.year} value={y.year.toString()}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Period Info */}
        {showPeriodInfo && (
          <div className="text-sm text-muted-foreground">
            {periodType === 'monthly' && currentMonth && (
              <span>Del {currentMonth.startDate} al {currentMonth.endDate}</span>
            )}
            {periodType === 'quarterly' && currentQuarter && (
              <span>Del {currentQuarter.startDate} al {currentQuarter.endDate}</span>
            )}
            {periodType === 'annual' && currentYear && (
              <span>Del {currentYear.startDate} al {currentYear.endDate}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
