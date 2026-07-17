// src/pages/journal/Index.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Filter } from 'lucide-react';
import { toast } from 'sonner';

import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { JournalEntry } from '@/accounting/types';
import { generateEntryId, generateChronologicalEntryId } from '@/accounting/utils';
import { getCurrentQuarter, getAllQuartersFromStart, parseQuarterString } from '@/accounting/quarterly-utils';
import { PeriodType, getCurrentMonth, isDateInPeriod, resolvePeriod } from '@/accounting/period-utils';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { usePersistedState } from '@/hooks/usePersistedState';
import { supabase } from '@/integrations/supabase/client';
import { postKardexMovement } from '@/accounting/domain/kardex-posting';
import { exportJournalToCSV } from '@/services/exportService';
import { exportJournalToPDF, JournalEntryPDF } from '@/services/pdfService';
import { logAuditEntry } from '@/services/auditService';

// Components
import { AIJournalAssistant } from '@/components/journal/AIJournalAssistant';
import { AIJournalSuggestion } from '@/services/aiService';
import { JournalEntryForm } from '@/components/journal/JournalEntryForm';
import { JournalEntriesTable } from '@/components/journal/JournalEntriesTable';
import { JournalFiltersComponent, JournalFilters, defaultFilters } from '@/components/journal/JournalFilters';
import { InlineKardexPopup, KardexData } from '@/components/kardex/InlineKardexPopup';
import { AuxiliaryLedgerModal } from '@/components/auxiliary-ledger/AuxiliaryLedgerModal';
import { CxpCxcModal, CxpCxcLineToProcess } from '@/components/journal/CxpCxcModal';
import { InventoryExitModal } from '@/components/inventory/InventoryExitModal';
import { FifoExitModal } from '@/components/inventory/FifoExitModal';
import { InventoryLot } from '@/components/inventory/fifo-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Hook
import { useJournalForm, LineDraft } from '@/hooks/useJournalForm';

export default function JournalPage() {
  const { accounts, entries, setEntries, adapter, auxiliaryDefinitions, kardexDefinitions, fiscalYears } = useAccounting();
  const { can } = useUserAccess();
  const canCreate  = can('journal', 'create');
  const canEdit    = can('journal', 'edit');
  const isReadOnly = !canCreate && !canEdit;
  const activeCompanyId = useActiveCompanyId();
  
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [period, setPeriod] = usePersistedState<{ periodType: PeriodType; quarter: string; year: number; month: string }>(
    'journal:period',
    {
      periodType: 'quarterly',
      quarter: getCurrentQuarter().label,
      year: new Date().getFullYear(),
      month: getCurrentMonth().label,
    }
  );
  const [showLineMemos, setShowLineMemos] = useState<boolean>(() => {
    return localStorage.getItem('journal-show-line-memos') === 'true';
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<JournalFilters>(defaultFilters);
  const [kardexPopupState, setKardexPopupState] = useState<{
    isOpen: boolean;
    lineIndex: number;
    accountId: string;
    lineAmount?: number;
    lineMemo?: string;
  } | null>(null);
  const [auxiliaryModalState, setAuxiliaryModalState] = useState<{
    isOpen: boolean;
    linesToProcess: Array<{ lineDraft: LineDraft; lineIndex: number; accountId: string; lineAmount: number; isIncrease: boolean }>;
    originalEntry: JournalEntry | null;
  }>({
    isOpen: false,
    linesToProcess: [],
    originalEntry: null
  });
  const [cxpCxcModalState, setCxpCxcModalState] = useState<{
    isOpen: boolean;
    linesToProcess: CxpCxcLineToProcess[];
    journalEntry: JournalEntry | null;
  }>({ isOpen: false, linesToProcess: [], journalEntry: null });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  
  // CPP exit modal state
  const [inventoryExitState, setInventoryExitState] = useState<{
    isOpen: boolean;
    journalEntryId: string;
    journalDate: string;
    costLines: Array<{ accountId: string; amount: number }>;
  }>({ isOpen: false, journalEntryId: '', journalDate: '', costLines: [] });

  // FIFO exit modal state
  const [fifoExitState, setFifoExitState] = useState<{
    isOpen: boolean;
    journalEntryId: string;
    journalDate: string;
    product: { id: string; nombre: string; unidad_medida: string };
    lots: InventoryLot[];
    costAccountId: string;
  }>({ isOpen: false, journalEntryId: '', journalDate: '', product: { id: '', nombre: '', unidad_medida: '' }, lots: [], costAccountId: '' });

  // Track the saved entry for auto-fill after inventory exit
  const [pendingSavedEntry, setPendingSavedEntry] = useState<JournalEntry | null>(null);

  // Use custom hook for form management
  const form = useJournalForm({
    accounts,
    entries,
    kardexDefinitions,
    fiscalYears,
    onKardexPopupOpen: (lineIndex, accountId, lineAmount, lineMemo) => {
      setKardexPopupState({
        isOpen: true,
        lineIndex,
        accountId,
        lineAmount,
        lineMemo,
      });
    }
  });

  // Filter entries by selected period and filters
  const currentQuarter = useMemo(() => parseQuarterString(period.quarter), [period.quarter]);
  const resolvedPeriod = useMemo(() => {
    const value = period.periodType === 'monthly' ? period.month
      : period.periodType === 'quarterly' ? period.quarter
      : String(period.year);
    return resolvePeriod({ type: period.periodType, value });
  }, [period]);
  const filteredEntries = useMemo(() => {
    let result = entries.filter(entry => isDateInPeriod(entry.date, resolvedPeriod));
    
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      result = result.filter(e => 
        e.id.toLowerCase().includes(search) || 
        e.memo?.toLowerCase().includes(search)
      );
    }
    if (filters.dateFrom) {
      result = result.filter(e => e.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter(e => e.date <= filters.dateTo);
    }
    if (filters.accountId) {
      result = result.filter(e => e.lines.some(l => l.account_id === filters.accountId));
    }
    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount);
      result = result.filter(e => e.lines.some(l => l.debit >= min || l.credit >= min));
    }
    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount);
      result = result.filter(e => e.lines.every(l => l.debit <= max && l.credit <= max));
    }
    if (filters.showVoided === 'only_voided') {
      result = result.filter(e => e.void_of);
    } else if (filters.showVoided === 'exclude_voided') {
      result = result.filter(e => !e.void_of);
    }
    
    return result;
  }, [entries, resolvedPeriod, filters]);

  const availableQuarters = useMemo(() => getAllQuartersFromStart(2020), []);

  useEffect(() => {
    localStorage.setItem('journal-show-line-memos', showLineMemos.toString());
  }, [showLineMemos]);

  function handleKardexPopupSave(kardexData: KardexData) {
    if (!kardexPopupState) return;
    form.handleKardexPopupSave(kardexData, kardexPopupState.lineIndex);
    setKardexPopupState(null);
  }

  function detectAuxiliaryLines(je: JournalEntry): Array<{ lineDraft: LineDraft; lineIndex: number; accountId: string; lineAmount: number; isIncrease: boolean }> {
    const auxiliaryLines: Array<{ lineDraft: LineDraft; lineIndex: number; accountId: string; lineAmount: number; isIncrease: boolean }> = [];
    const auxiliaryAccountIds = auxiliaryDefinitions.map(d => d.account_id);
    
    je.lines.forEach((line, index) => {
      if (auxiliaryAccountIds.includes(line.account_id)) {
        const lineDraft = form.lines[index];
        const lineAmount = line.debit || line.credit;
        const account = accounts.find(a => a.id === line.account_id);
        const isIncrease = account?.normal_side === 'DEBE' ? line.debit > 0 : line.credit > 0;
        
        auxiliaryLines.push({ lineDraft, lineIndex: index, accountId: line.account_id, lineAmount, isIncrease });
      }
    });
    
    return auxiliaryLines;
  }

  function detectCxpCxcLines(je: JournalEntry): CxpCxcLineToProcess[] {
    const lines: CxpCxcLineToProcess[] = [];
    je.lines.forEach((line, index) => {
      const account = accounts.find(a => a.id === line.account_id);
      const modulo = account?.modulo_vinculado;
      if (modulo !== 'cxp' && modulo !== 'cxc') return;
      const lineAmount = line.debit || line.credit;
      if (lineAmount <= 0) return;
      const isIncrease = account.normal_side === 'DEBE' ? line.debit > 0 : line.credit > 0;
      lines.push({ lineIndex: index, accountId: line.account_id, accountName: account.name, lineAmount, isIncrease, modulo });
    });
    return lines;
  }

  async function saveEntry() {
    const je = form.validateAndBuildEntry();
    if (!je) return;
    
    const auxiliaryLines = detectAuxiliaryLines(je);
    
    if (auxiliaryLines.length > 0) {
      setAuxiliaryModalState({
        isOpen: true,
        linesToProcess: auxiliaryLines,
        originalEntry: je
      });
      return;
    }
    
    await handleFinalSave(je);
  }

  async function handleAuxiliarySave(je: JournalEntry) {
    await handleFinalSave(je);
  }

  async function handleFinalSave(je: JournalEntry) {
    try {
      await adapter.saveEntry(je);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        for (const line of form.lines) {
          if (line.kardexData && line.account_id) {
            const kardexDef = kardexDefinitions.find(d => d.account_id === line.account_id);
            if (!kardexDef) continue;
            await postKardexMovement({
              accountId: line.account_id,
              companyId: activeCompanyId,
              userId: user.id,
              fecha: je.date,
              journalEntryId: je.id,
              data: line.kardexData,
            });
          }
        }
      }
      
      setEntries(await adapter.loadEntries());
      toast.success(`Asiento ${je.id} ${form.editingEntry ? 'actualizado' : 'guardado'}`);
      form.clearForm();

      // Detect cost-of-sales lines for inventory exit
      const costLines = je.lines
        .map(line => {
          const acct = accounts.find(a => a.id === line.account_id);
          if (acct && (acct as any).clasificacion_resultado === 'costo_ventas') {
            return { accountId: line.account_id, amount: line.debit || line.credit };
          }
          return null;
        })
        .filter(Boolean) as Array<{ accountId: string; amount: number }>;

      if (costLines.length > 0) {
        // Save the entry reference for auto-fill after inventory exit
        setPendingSavedEntry(je);
        // Always open CPP modal — user selects product and quantity there
        setInventoryExitState({
          isOpen: true,
          journalEntryId: je.id,
          journalDate: je.date,
          costLines,
        });
      }

      // Detect lines touching accounts vinculadas a CxP/CxC — el asiento ya
      // está guardado (je.id confirmado), así que el modal solo vincula.
      const cxpCxcLines = detectCxpCxcLines(je);
      if (cxpCxcLines.length > 0) {
        setCxpCxcModalState({ isOpen: true, linesToProcess: cxpCxcLines, journalEntry: je });
      }
    } catch (e: any) {
      toast.error(e.message || 'Error guardando asiento');
    }
  }

  // Auto-update journal entry cost lines after inventory exit
  async function handleInventoryExitSave(totalCosto: number) {
    if (pendingSavedEntry && totalCosto > 0) {
      try {
        // Update the journal lines with the calculated cost
        const je = pendingSavedEntry;
        for (const line of je.lines) {
          const acct = accounts.find(a => a.id === line.account_id);
          if (acct && (acct as any).clasificacion_resultado === 'costo_ventas') {
            // Update the debit on cost-of-sales line
            await supabase
              .from('journal_lines')
              .update({ debit: totalCosto, credit: 0 })
              .eq('entry_id', je.id)
              .eq('account_id', line.account_id);
          }
        }
        // Reload entries to reflect updated amounts
        setEntries(await adapter.loadEntries());
        toast.info(`Monto de costo de ventas actualizado a ${totalCosto.toFixed(2)}`);
      } catch (e: any) {
        console.error('Error updating journal amounts:', e);
      }
    }
    setPendingSavedEntry(null);
    setInventoryExitState({ ...inventoryExitState, isOpen: false });
    setFifoExitState({ ...fifoExitState, isOpen: false });
  }

  const handleDeleteClick = (id: string) => {
    setEntryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;

    try {
      await adapter.deleteEntry(entryToDelete);
      setEntries(await adapter.loadEntries());
      toast.success('Asiento eliminado');
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo eliminar asiento');
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
    }
  };

  async function voidEntry(orig: JournalEntry) {
    const inv: JournalEntry = {
      id: generateEntryId(orig.date, entries),
      date: orig.date,
      entry_time: orig.entry_time,
      memo: (orig.memo ? `${orig.memo} ` : '') + '(ANULACIÓN)',
      void_of: orig.id,
      lines: orig.lines.map(l => ({
        account_id: l.account_id,
        debit: l.credit,
        credit: l.debit,
        line_memo: l.line_memo
      }))
    };
    try {
      await adapter.saveEntry(inv);
      setEntries(await adapter.loadEntries());
      toast.success(`Asiento ${orig.id} anulado con ${inv.id}`);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo anular');
    }
  }

  function applyAISuggestion(suggestion: AIJournalSuggestion) {
    form.setDate(suggestion.date);
    form.setMemo(suggestion.memo);
    const draftLines = suggestion.lines.map(line => ({
      account_id: line.account_id,
      debit: line.debit > 0 ? String(line.debit) : '',
      credit: line.credit > 0 ? String(line.credit) : '',
    }));
    while (draftLines.length < 3) draftLines.push({ account_id: '', debit: '', credit: '' });
    form.setLines(draftLines);
    document.querySelector('[data-journal-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Libro Diario</h1>
        <Button variant="outline" onClick={() => exportJournalToCSV(entries)}>
          <Download className="w-4 h-4 mr-2" />
          Exportar Diario
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <PeriodSelector
            periodType={period.periodType}
            onPeriodTypeChange={(t) => setPeriod((p) => ({ ...p, periodType: t }))}
            selectedQuarter={period.quarter}
            onQuarterChange={(q) => setPeriod((p) => ({ ...p, quarter: q }))}
            selectedYear={period.year}
            onYearChange={(y) => setPeriod((p) => ({ ...p, year: y }))}
            selectedMonth={period.month}
            onMonthChange={(m) => setPeriod((p) => ({ ...p, month: m }))}
            availableQuarters={availableQuarters}
            currentQuarter={currentQuarter}
          />
        </CardHeader>
      </Card>

      {/* Form - Only show for owners */}
      {!isReadOnly && (
        <>
          <div data-journal-form>
            <AIJournalAssistant
              accounts={accounts}
              onApplySuggestion={applyAISuggestion}
            />
          </div>
          <JournalEntryForm
          date={form.date}
          onDateChange={form.setDate}
          entryTime={form.entryTime}
          onEntryTimeChange={form.setEntryTime}
          memo={form.memo}
          onMemoChange={form.setMemo}
          lines={form.lines}
          accounts={accounts}
          editingEntry={form.editingEntry}
          showLineMemos={showLineMemos}
          onToggleLineMemos={() => setShowLineMemos(!showLineMemos)}
          totals={form.totals}
          onAddLine={form.addLine}
          onAccountChange={form.handleAccountChange}
          onLineChange={form.setLine}
          onRemoveLine={form.removeLine}
          onSave={saveEntry}
          onClear={form.clearForm}
        />
        </>
      )}

      <JournalEntriesTable
        entries={filteredEntries}
        accounts={accounts}
        isReadOnly={isReadOnly}
        sortOrder={sortOrder}
        selectedQuarter={resolvedPeriod.label}
        onSortOrderChange={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        onEdit={form.editEntry}
        onVoid={voidEntry}
        onDelete={handleDeleteClick}
      />

      {kardexPopupState && (
        <InlineKardexPopup
          isOpen={kardexPopupState.isOpen}
          onClose={() => setKardexPopupState(null)}
          accountId={kardexPopupState.accountId}
          lineAmount={kardexPopupState.lineAmount}
          onSave={handleKardexPopupSave}
          initialData={form.lines[kardexPopupState.lineIndex]?.kardexData}
          initialConcepto={kardexPopupState.lineMemo}
        />
      )}

      <AuxiliaryLedgerModal
        isOpen={auxiliaryModalState.isOpen}
        onClose={() => setAuxiliaryModalState({ ...auxiliaryModalState, isOpen: false })}
        linesToProcess={auxiliaryModalState.linesToProcess}
        originalEntry={auxiliaryModalState.originalEntry}
        onSave={handleAuxiliarySave}
      />

      {cxpCxcModalState.isOpen && cxpCxcModalState.journalEntry && (
        <CxpCxcModal
          isOpen={cxpCxcModalState.isOpen}
          linesToProcess={cxpCxcModalState.linesToProcess}
          journalEntry={cxpCxcModalState.journalEntry}
          companyId={activeCompanyId}
          onDone={() => setCxpCxcModalState({ isOpen: false, linesToProcess: [], journalEntry: null })}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El asiento será eliminado permanentemente.
              Si este asiento tiene movimientos auxiliares, de kardex, o una CxP/CxC vinculada sin pagos, también serán eliminados.
              Si la CxP/CxC vinculada ya tiene pagos registrados, la eliminación se bloqueará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InventoryExitModal
        isOpen={inventoryExitState.isOpen}
        onClose={() => { setInventoryExitState({ ...inventoryExitState, isOpen: false }); setPendingSavedEntry(null); }}
        journalEntryId={inventoryExitState.journalEntryId}
        journalDate={inventoryExitState.journalDate}
        costLines={inventoryExitState.costLines}
        onSave={handleInventoryExitSave}
      />

      <FifoExitModal
        isOpen={fifoExitState.isOpen}
        onClose={() => { setFifoExitState({ ...fifoExitState, isOpen: false }); setPendingSavedEntry(null); }}
        product={fifoExitState.product}
        lots={fifoExitState.lots}
        journalEntryId={fifoExitState.journalEntryId}
        journalDate={fifoExitState.journalDate}
        onSaved={handleInventoryExitSave}
      />
    </div>
  );
}
