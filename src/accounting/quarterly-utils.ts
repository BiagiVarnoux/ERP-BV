// src/accounting/quarterly-utils.ts
import { nowInAppTZ } from './timezone';

function nowPartsInTZ() {
  const { year, month } = nowInAppTZ();
  return { year, month };
}

export interface Quarter {
  year: number;
  quarter: number;
  label: string;
  startDate: string;
  endDate: string;
}

export function getCurrentQuarter(): Quarter {
  const { year, month } = nowPartsInTZ();
  const quarter = Math.ceil(month / 3);
  
  return {
    year,
    quarter,
    label: `Q${quarter} ${year}`,
    startDate: getQuarterStartDate(year, quarter),
    endDate: getQuarterEndDate(year, quarter)
  };
}

export function getQuarterStartDate(year: number, quarter: number): string {
  const month = (quarter - 1) * 3 + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function getQuarterEndDate(year: number, quarter: number): string {
  const month = quarter * 3;
  const date = new Date(year, month, 0); // Last day of the quarter (local time)
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getPreviousQuarter(year: number, quarter: number): Quarter {
  let prevYear = year;
  let prevQuarter = quarter - 1;
  
  if (prevQuarter === 0) {
    prevQuarter = 4;
    prevYear = year - 1;
  }
  
  return {
    year: prevYear,
    quarter: prevQuarter,
    label: `Q${prevQuarter} ${prevYear}`,
    startDate: getQuarterStartDate(prevYear, prevQuarter),
    endDate: getQuarterEndDate(prevYear, prevQuarter)
  };
}

export function getAllQuartersFromStart(startYear: number = 2020): Quarter[] {
  const quarters: Quarter[] = [];
  const currentQuarter = getCurrentQuarter();
  
  for (let year = startYear; year <= currentQuarter.year; year++) {
    const maxQuarter = year === currentQuarter.year ? currentQuarter.quarter : 4;
    for (let quarter = 1; quarter <= maxQuarter; quarter++) {
      quarters.push({
        year,
        quarter,
        label: `Q${quarter} ${year}`,
        startDate: getQuarterStartDate(year, quarter),
        endDate: getQuarterEndDate(year, quarter)
      });
    }
  }
  
  return quarters.reverse(); // Most recent first
}

export function parseQuarterString(quarterString: string): Quarter {
  const [q, year] = quarterString.split(' ');
  const quarter = parseInt(q.replace('Q', ''));
  const yearNum = parseInt(year);
  
  return {
    year: yearNum,
    quarter,
    label: quarterString,
    startDate: getQuarterStartDate(yearNum, quarter),
    endDate: getQuarterEndDate(yearNum, quarter)
  };
}

export function isDateInQuarter(date: string, quarter: Quarter): boolean {
  return date >= quarter.startDate && date <= quarter.endDate;
}

export function getQuarterIdentifier(date: string): string {
  // Parse date string directly to avoid timezone issues
  const [yearStr, monthStr] = date.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const quarter = Math.ceil(month / 3);
  const shortYear = year.toString().slice(-2);
  
  return `Q${quarter}-${shortYear}`;
}