// src/accounting/AccountingProvider.tsx
// Context provider for accounting data (accounts, entries, auxiliary ledgers, fiscal years)
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Account, FiscalYear, JournalEntry, AuxiliaryLedgerEntry, AuxiliaryLedgerDefinition, KardexDefinition } from './types';
import { IDataAdapter, LocalAdapter, pickAdapter } from './data-adapter';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { DEFAULT_COMPANY_ID } from '@/lib/constants';
import { toast } from 'sonner';

interface AccountingContextType {
  accounts: Account[];
  entries: JournalEntry[];
  auxiliaryEntries: AuxiliaryLedgerEntry[];
  auxiliaryDefinitions: AuxiliaryLedgerDefinition[];
  kardexDefinitions: KardexDefinition[];
  fiscalYears: FiscalYear[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  setEntries: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  setAuxiliaryEntries: React.Dispatch<React.SetStateAction<AuxiliaryLedgerEntry[]>>;
  setAuxiliaryDefinitions: React.Dispatch<React.SetStateAction<AuxiliaryLedgerDefinition[]>>;
  setKardexDefinitions: React.Dispatch<React.SetStateAction<KardexDefinition[]>>;
  setFiscalYears: React.Dispatch<React.SetStateAction<FiscalYear[]>>;
  reloadEntries: () => Promise<void>;
  adapter: IDataAdapter;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export function useAccounting() {
  const context = useContext(AccountingContext);
  if (!context) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
}

interface AccountingProviderProps {
  children: React.ReactNode;
}

export function AccountingProvider({ children }: AccountingProviderProps) {
  const { companyId: ctxCompanyId, loading: accessLoading } = useUserAccess();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [auxiliaryEntries, setAuxiliaryEntries] = useState<AuxiliaryLedgerEntry[]>([]);
  const [auxiliaryDefinitions, setAuxiliaryDefinitions] = useState<AuxiliaryLedgerDefinition[]>([]);
  const [kardexDefinitions, setKardexDefinitions] = useState<KardexDefinition[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [adapter, setAdapter] = useState<IDataAdapter>(LocalAdapter);
  const adapterRef = React.useRef<IDataAdapter>(LocalAdapter);

  async function reloadEntries() {
    try {
      const es = await adapterRef.current.loadEntries();
      setEntries(es);
    } catch (e: any) {
      console.error('reloadEntries:', e);
    }
  }

  useEffect(() => {
    // Esperar a que el contexto de acceso termine de cargar
    if (accessLoading) return;

    const activeCompanyId = ctxCompanyId ?? DEFAULT_COMPANY_ID;

    (async () => {
      const db = await pickAdapter(activeCompanyId);
      adapterRef.current = db;
      setAdapter(db);
      try {
        const acc = await db.loadAccounts();
        setAccounts(acc);
        const es = await db.loadEntries();
        setEntries(es);
        const aux = await db.loadAuxiliaryEntries();
        setAuxiliaryEntries(aux);
        const defs = await db.loadAuxiliaryDefinitions();
        setAuxiliaryDefinitions(defs);
        const kardexDefs = await db.loadKardexDefinitions();
        setKardexDefinitions(kardexDefs);

        // Gestiones fiscales filtradas por empresa activa
        if (supabase) {
          const { data: fyData, error: fyError } = await supabase
            .from('fiscal_years')
            .select('*')
            .eq('company_id', activeCompanyId)
            .order('year', { ascending: true });
          if (fyError) {
            console.warn('fiscal_years not loaded:', fyError.message);
          } else {
            setFiscalYears((fyData ?? []) as FiscalYear[]);
          }
        }
      } catch(e: any) {
        console.error(e);
        toast.error(e.message || "Error cargando datos");
      }
    })();
  }, [ctxCompanyId, accessLoading]);

  return (
    <AccountingContext.Provider value={{
      accounts,
      entries,
      auxiliaryEntries,
      auxiliaryDefinitions,
      kardexDefinitions,
      fiscalYears,
      setAccounts,
      setEntries,
      setAuxiliaryEntries,
      setAuxiliaryDefinitions,
      setKardexDefinitions,
      setFiscalYears,
      reloadEntries,
      adapter
    }}>
      {children}
    </AccountingContext.Provider>
  );
}
