// src/accounting/utils.ts
import { AccountType, Side, Account, JournalEntry } from './types';
import { getQuarterIdentifier } from './quarterly-utils';
export { APP_TIMEZONE, nowInAppTZ, todayISO } from './timezone';

/** Round to 2 decimal places - use for all financial calculations */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 6 decimal places - use for inventory unit costs (avoids loss when dividing totals by large quantities) */
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function fmt(n: number) {
  return n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function yyyymm(date: string) { 
  return date.slice(0,7); 
}

export function toDecimal(val?: string) {
  if (!val) return 0;
  // Permite "1.234,56" o "1234,56" (coma como decimal)
  const s = val.replace(/\s+/g, "");
  // Si hay coma, se asume decimal: quita puntos de miles y cambia coma por punto
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

export function formatDecimal(n: number): string {
  // Formatea número para input usando coma como decimal
  return n === 0 ? "" : n.toString().replace(".", ",");
}

export function cmpDate(a: string, b: string) { 
  return a.localeCompare(b); 
}

export function generateEntryId(date: string, existing: JournalEntry[]) {
  const quarterIdentifier = getQuarterIdentifier(date);
  
  // Filter existing entries for the same quarter
  const quarterEntries = existing.filter(e => {
    return e.id.endsWith(`-${quarterIdentifier}`);
  });
  
  // Find the highest sequential number for this quarter
  let maxSequence = 0;
  quarterEntries.forEach(entry => {
    const match = entry.id.match(/^(\d{3})-/);
    if (match) {
      const sequence = parseInt(match[1], 10);
      if (sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  });
  
  // Generate next sequential number with 3-digit padding
  const nextSequence = maxSequence + 1;
  return `${String(nextSequence).padStart(3, '0')}-${quarterIdentifier}`;
}

// Generate entry ID respecting chronological order
export function generateChronologicalEntryId(date: string, existing: JournalEntry[]): string {
  const quarterIdentifier = getQuarterIdentifier(date);
  
  // Get all entries in this quarter, sorted by date
  const quarterEntries = existing
    .filter(e => e.id.endsWith(`-${quarterIdentifier}`))
    .sort((a, b) => cmpDate(a.date, b.date) || a.id.localeCompare(b.id));
  
  if (quarterEntries.length === 0) {
    return `001-${quarterIdentifier}`;
  }
  
  // Find where this entry should be inserted based on date
  const insertIndex = quarterEntries.findIndex(e => e.date > date);
  
  if (insertIndex === -1) {
    // Entry goes at the end - use next sequential number
    const lastEntry = quarterEntries[quarterEntries.length - 1];
    const match = lastEntry.id.match(/^(\d{3})-/);
    const lastSeq = match ? parseInt(match[1], 10) : 0;
    return `${String(lastSeq + 1).padStart(3, '0')}-${quarterIdentifier}`;
  }
  
  // Entry needs to be inserted in the middle
  // Find a sequence number between prev and current
  const currentEntry = quarterEntries[insertIndex];
  const currentMatch = currentEntry.id.match(/^(\d{3})-/);
  const currentSeq = currentMatch ? parseInt(currentMatch[1], 10) : 1;
  
  if (insertIndex === 0) {
    // Insert before first - need to renumber
    return `001-${quarterIdentifier}`;
  }
  
  const prevEntry = quarterEntries[insertIndex - 1];
  const prevMatch = prevEntry.id.match(/^(\d{3})-/);
  const prevSeq = prevMatch ? parseInt(prevMatch[1], 10) : 0;
  
  // If there's room between sequences, use middle value
  if (currentSeq - prevSeq > 1) {
    const newSeq = Math.floor((prevSeq + currentSeq) / 2);
    return `${String(newSeq).padStart(3, '0')}-${quarterIdentifier}`;
  }
  
  // No room - need to use the next available sequence
  const maxSeq = Math.max(...quarterEntries.map(e => {
    const m = e.id.match(/^(\d{3})-/);
    return m ? parseInt(m[1], 10) : 0;
  }));
  return `${String(maxSeq + 1).padStart(3, '0')}-${quarterIdentifier}`;
}

export function signedBalanceFor(deb: number, hab: number, side: Side) {
  return round2(side === "DEBE" ? (deb - hab) : (hab - deb));
}

// --- Abreviaciones de tipo de cuenta y lógica de signo (+/-) ---
export const TYPE_ABBR: Record<AccountType, string> = {
  ACTIVO: "A",
  PASIVO: "P",
  PATRIMONIO: "Pn",
  INGRESO: "I",
  GASTO: "G",
};

export function increaseSideFor(type: AccountType): Side {
  // A y G aumentan en DEBE; P, Pn e I aumentan en HABER
  return (type === "ACTIVO" || type === "GASTO") ? "DEBE" : "HABER";
}

export function signForLine(account: Account | undefined, line: { debit?: number | string; credit?: number | string }): "+" | "-" | "" {
  if (!account) return "";
  const debitVal = typeof line.debit === "string" ? toDecimal(line.debit) : (line.debit || 0);
  const creditVal = typeof line.credit === "string" ? toDecimal(line.credit) : (line.credit || 0);
  const side: Side = debitVal > 0 ? "DEBE" : creditVal > 0 ? "HABER" : "" as any;
  if (!side) return "";
  return side === increaseSideFor(account.type) ? "+" : "-";
}