// src/accounting/period-utils.ts
// Unified period utilities supporting monthly, quarterly, and annual views.
import { Quarter, getCurrentQuarter, parseQuarterString, isDateInQuarter, getAllQuartersFromStart } from './quarterly-utils';
import { nowInAppTZ } from './utils';

export type PeriodType = 'monthly' | 'quarterly' | 'annual';

export interface MonthPeriod {
  year: number;
  month: number; // 1-12
  label: string; // "Enero 2026"
  startDate: string;
  endDate: string;
}

export interface YearPeriod {
  year: number;
  label: string; // "Año 2026"
  startDate: string;
  endDate: string;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function getMonthStartDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function getMonthEndDate(year: number, month: number): string {
  // Last day of the month — use Date(year, month, 0) which gives last day of `month` (1-indexed input)
  const d = new Date(year, month, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildMonth(year: number, month: number): MonthPeriod {
  return {
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    startDate: getMonthStartDate(year, month),
    endDate: getMonthEndDate(year, month),
  };
}

export function getCurrentMonth(): MonthPeriod {
  const { year, month } = nowInAppTZ();
  return buildMonth(year, month);
}

export function getAllMonthsFromStart(startYear: number = 2020): MonthPeriod[] {
  const months: MonthPeriod[] = [];
  const { year: currentYear, month: currentMonth } = nowInAppTZ();
  for (let year = startYear; year <= currentYear; year++) {
    const maxMonth = year === currentYear ? currentMonth : 12;
    for (let month = 1; month <= maxMonth; month++) {
      months.push(buildMonth(year, month));
    }
  }
  return months.reverse(); // most recent first
}

export function parseMonthString(label: string): MonthPeriod {
  // "Enero 2026"
  const [name, yearStr] = label.split(' ');
  const month = MONTH_NAMES.findIndex(n => n.toLowerCase() === name.toLowerCase()) + 1;
  const year = parseInt(yearStr, 10);
  return buildMonth(year, month || 1);
}

export function isDateInMonth(date: string, month: MonthPeriod): boolean {
  return date >= month.startDate && date <= month.endDate;
}

export function getYearPeriod(year: number): YearPeriod {
  return {
    year,
    label: `Año ${year}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

export function getCurrentYear(): YearPeriod {
  return getYearPeriod(nowInAppTZ().year);
}

export function getAvailableYears(startYear: number = 2020): YearPeriod[] {
  const currentYear = nowInAppTZ().year;
  const years: YearPeriod[] = [];
  for (let y = currentYear; y >= startYear; y--) years.push(getYearPeriod(y));
  return years;
}

export function isDateInYear(date: string, year: number): boolean {
  return date >= `${year}-01-01` && date <= `${year}-12-31`;
}

// Generic period descriptor used by callers
export interface PeriodValue {
  type: PeriodType;
  value: string; // month label, quarter label, or year as string
}

export interface ResolvedPeriod {
  type: PeriodType;
  label: string;
  startDate: string;
  endDate: string;
}

export function resolvePeriod(p: PeriodValue): ResolvedPeriod {
  if (p.type === 'monthly') {
    const m = parseMonthString(p.value);
    return { type: 'monthly', label: m.label, startDate: m.startDate, endDate: m.endDate };
  }
  if (p.type === 'quarterly') {
    const q = parseQuarterString(p.value);
    return { type: 'quarterly', label: q.label, startDate: q.startDate, endDate: q.endDate };
  }
  const y = parseInt(p.value, 10);
  const yp = getYearPeriod(y);
  return { type: 'annual', label: yp.label, startDate: yp.startDate, endDate: yp.endDate };
}

export function isDateInPeriod(date: string, period: PeriodValue | ResolvedPeriod): boolean {
  const r = 'startDate' in period ? period : resolvePeriod(period);
  return date >= r.startDate && date <= r.endDate;
}

export function getDefaultPeriodValue(type: PeriodType): string {
  if (type === 'monthly') return getCurrentMonth().label;
  if (type === 'quarterly') return getCurrentQuarter().label;
  return String(nowInAppTZ().year);
}

export function getDefaultPeriod(): PeriodValue {
  return { type: 'quarterly', value: getCurrentQuarter().label };
}

// Re-export for convenience
export { getCurrentQuarter, parseQuarterString, isDateInQuarter, getAllQuartersFromStart };
export type { Quarter };
