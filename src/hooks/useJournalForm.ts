// src/hooks/useJournalForm.ts
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { FiscalYear, JournalEntry, JournalLine, Account } from '@/accounting/types';
import { isDateInClosedPeriod } from '@/accounting/fiscal-year-utils';
import { todayISO, nowTimeHHMM, toDecimal, formatDecimal, generateEntryId, round2 } from '@/accounting/utils';
import { KardexData } from '@/components/kardex/InlineKardexPopup';

export type LineDraft = {
  account_id?: string;
  debit?: string;
  credit?: string;
  line_memo?: string;
  kardexData?: KardexData;
};

export interface UseJournalFormProps {
  accounts: Account[];
  entries: JournalEntry[];
  kardexDefinitions: Array<{ account_id: string }>;
  fiscalYears: FiscalYear[];
  onKardexPopupOpen: (lineIndex: number, accountId: string, lineAmount?: number, lineMemo?: string) => void;
}

export interface UseJournalFormReturn {
  // State
  date: string;
  setDate: (date: string) => void;
  entryTime: string;
  setEntryTime: (time: string) => void;
  memo: string;
  setMemo: (memo: string) => void;
  lines: LineDraft[];
  editingEntry: JournalEntry | null;
  
  // Line management
  addLine: () => void;
  setLine: (idx: number, patch: Partial<LineDraft>) => void;
  setLines: (lines: LineDraft[]) => void;
  removeLine: (idx: number) => void;
  handleAccountChange: (idx: number, accountId: string) => void;
  handleKardexPopupSave: (kardexData: KardexData, lineIndex: number) => void;
  
  // Form actions
  validateAndBuildEntry: () => JournalEntry | null;
  clearForm: () => void;
  editEntry: (entry: JournalEntry) => void;
  
  // Computed
  totals: { debit: number; credit: number; diff: number };
}

export function useJournalForm({
  accounts,
  entries,
  kardexDefinitions,
  fiscalYears,
  onKardexPopupOpen,
}: UseJournalFormProps): UseJournalFormReturn {
  const [date, setDate] = useState<string>(todayISO());
  const [entryTime, setEntryTime] = useState<string>(nowTimeHHMM());
  const [memo, setMemo] = useState<string>('');
  const [lines, setLines] = useState<LineDraft[]>([{}, {}, {}]);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const addLine = useCallback(() => {
    setLines(ls => [...ls, {}]);
  }, []);

  const setLine = useCallback((idx: number, patch: Partial<LineDraft>) => {
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines(ls => ls.filter((_, i) => i !== idx));
  }, []);

  const handleAccountChange = useCallback((idx: number, accountId: string) => {
    const newLine = { ...lines[idx], account_id: accountId };
    
    // Check if this account has a kardex definition
    const hasKardex = kardexDefinitions.some(d => d.account_id === accountId);
    
    if (hasKardex) {
      // Calculate line amount
      const debitVal = toDecimal(newLine.debit);
      const creditVal = toDecimal(newLine.credit);
      const lineAmount = debitVal || creditVal;
      
      const initialConcepto = newLine.line_memo?.trim() || memo.trim() || undefined;
      onKardexPopupOpen(idx, accountId, lineAmount > 0 ? lineAmount : undefined, initialConcepto);
    }
    
    setLine(idx, { account_id: accountId });
  }, [lines, kardexDefinitions, onKardexPopupOpen, setLine, memo]);

  const handleKardexPopupSave = useCallback((kardexData: KardexData, lineIndex: number) => {
    setLine(lineIndex, {
      kardexData,
      line_memo: kardexData.concepto,
    });
  }, [setLine]);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) {
      const dv = toDecimal(l.debit);
      const cv = toDecimal(l.credit);
      d += dv;
      c += cv;
    }
    return { debit: d, credit: c, diff: +(d - c).toFixed(2) };
  }, [lines]);

  const validateAndBuildEntry = useCallback((): JournalEntry | null => {
    // Period lock — frontend validation.
    // TODO: agregar trigger de BD en journal_entries para defensa en profundidad del period lock
    // Ver: supabase/migrations — PR futuro pendiente.
    if (isDateInClosedPeriod(date, fiscalYears)) {
      const fy = fiscalYears.find(f => date >= f.start_date && date <= f.end_date);
      toast.error(
        `No se pueden registrar asientos en la gestión ${fy?.year ?? ''}, que está cerrada. ` +
        `Reabra la gestión en Configuración → Gestiones si necesita hacer ajustes.`
      );
      return null;
    }

    const clean: JournalLine[] = [];
    for (const l of lines) {
      const acc = l.account_id?.trim();
      const d = toDecimal(l.debit);
      const c = toDecimal(l.credit);
      if (!acc && d === 0 && c === 0) continue;
      if (!acc) {
        toast.error('Línea sin cuenta');
        return null;
      }
      const accExists = accounts.find(a => a.id === acc && a.is_active);
      if (!accExists) {
        toast.error(`Cuenta ${acc} no existe o está inactiva`);
        return null;
      }
      if (d > 0 && c > 0) {
        toast.error('Una línea no puede tener Debe y Haber a la vez');
        return null;
      }
      if (d === 0 && c === 0) {
        toast.error('Línea sin importe');
        return null;
      }
      clean.push({ account_id: acc, debit: round2(d), credit: round2(c), line_memo: l.line_memo?.trim() });
    }
    if (clean.length < 2) {
      toast.error('El asiento necesita al menos 2 líneas');
      return null;
    }
    const sumD = clean.reduce((s, l) => s + l.debit, 0);
    const sumC = clean.reduce((s, l) => s + l.credit, 0);
    if (+sumD.toFixed(2) !== +sumC.toFixed(2)) {
      toast.error('El asiento no cuadra (Debe ≠ Haber)');
      return null;
    }
    const id = editingEntry ? editingEntry.id : generateEntryId(date, entries);
    const time = entryTime.trim();
    return { id, date, entry_time: time || undefined, memo: memo.trim() || undefined, lines: clean };
  }, [lines, accounts, editingEntry, date, entryTime, memo, entries, fiscalYears]);

  const clearForm = useCallback(() => {
    setMemo('');
    setLines([{}, {}, {}]);
    setEntryTime(nowTimeHHMM());
    setEditingEntry(null);
  }, []);

  const editEntry = useCallback((entry: JournalEntry) => {
    if (entry.void_of) {
      toast.error('No se puede editar un asiento de anulación');
      return;
    }
    setDate(entry.date);
    setEntryTime(entry.entry_time || '');
    setMemo(entry.memo || '');
    setLines(
      entry.lines.map(l => ({
        account_id: l.account_id,
        debit: formatDecimal(l.debit),
        credit: formatDecimal(l.credit),
        line_memo: l.line_memo,
      }))
    );
    setEditingEntry(entry);
  }, []);

  return {
    date,
    setDate,
    entryTime,
    setEntryTime,
    memo,
    setMemo,
    lines,
    editingEntry,
    addLine,
    setLine,
    setLines,
    removeLine,
    handleAccountChange,
    handleKardexPopupSave,
    validateAndBuildEntry,
    clearForm,
    editEntry,
    totals,
  };
}
