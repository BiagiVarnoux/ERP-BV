// src/accounting/data-adapter.ts
import { Account, JournalEntry, AuxiliaryLedgerEntry, AuxiliaryLedgerDefinition, AuxiliaryMovementDetail, KardexDefinition, seedAccounts } from './types';
import { cmpDate, round2 } from './utils';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_COMPANY_ID } from '@/lib/constants';

type MaybeSupa = import("@supabase/supabase-js").SupabaseClient | null;

async function getSupabase(): Promise<MaybeSupa> {
  return supabase;
}

/**
 * Fetch ALL rows from a Supabase query, paginating in chunks of PAGE_SIZE.
 * Avoids the silent 1000-row PostgREST limit that would otherwise truncate
 * large tables (journal_lines, journal_entries, auxiliary_movement_details, etc).
 */
const PAGE_SIZE = 1000;
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Hard safety cap to avoid infinite loops (1M rows)
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/** Chunk an array into smaller arrays of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface IDataAdapter {
  loadAccounts(): Promise<Account[]>;
  upsertAccount(a: Account): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  loadEntries(): Promise<JournalEntry[]>;
  saveEntry(e: JournalEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  loadAuxiliaryDefinitions(): Promise<AuxiliaryLedgerDefinition[]>;
  upsertAuxiliaryDefinition(d: AuxiliaryLedgerDefinition): Promise<void>;
  deleteAuxiliaryDefinition(id: string): Promise<void>;
  loadAuxiliaryEntries(): Promise<AuxiliaryLedgerEntry[]>;
  upsertAuxiliaryEntry(a: AuxiliaryLedgerEntry): Promise<AuxiliaryLedgerEntry>;
  deleteAuxiliaryEntry(id: string): Promise<void>;
  loadAuxiliaryDetails(auxEntryId: string): Promise<AuxiliaryMovementDetail[]>;
  upsertAuxiliaryMovementDetails(details: AuxiliaryMovementDetail[]): Promise<void>;
  loadKardexDefinitions(): Promise<KardexDefinition[]>;
  loadClosingBalances(quarterEndDate: string): Promise<Record<string, number>>;
  saveClosingBalances(quarterEndDate: string, balances: Record<string, number>): Promise<void>;
  closeAuxiliaryEntry(id: string, closureDate: string): Promise<void>;
  reopenAuxiliaryEntry(id: string): Promise<void>;
}

const LS_ACCOUNTS = "acc_es_v1";
const LS_ENTRIES  = "je_es_v1";
const LS_AUX_DEFINITIONS = "aux_definitions_v1";
const LS_AUXILIARY = "aux_ledger_v1";
const LS_AUX_MOVEMENTS = "aux_movements_v1";

export const LocalAdapter: IDataAdapter = {
  async loadAccounts(){ 
    const raw = localStorage.getItem(LS_ACCOUNTS); 
    return raw ? JSON.parse(raw) : seedAccounts; 
  },
  async upsertAccount(a){ 
    const list = await this.loadAccounts(); 
    const i = list.findIndex(x=>x.id===a.id); 
    if (i>=0) list[i]=a; else list.push(a); 
    list.sort((x,y)=>x.id.localeCompare(y.id)); 
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list)); 
  },
  async deleteAccount(id){ 
    const es = await this.loadEntries(); 
    if (es.some(e=> e.lines.some(l=>l.account_id===id))) throw new Error("Cuenta con movimientos"); 
    const list = await this.loadAccounts(); 
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list.filter(a=>a.id!==id))); 
  },
  async loadEntries(){ 
    const raw = localStorage.getItem(LS_ENTRIES); 
    return raw ? JSON.parse(raw) : []; 
  },
  async saveEntry(e){ 
    const list = await this.loadEntries(); 
    list.push(e); 
    list.sort((a,b)=> cmpDate(a.date,b.date) || a.id.localeCompare(b.id)); 
    localStorage.setItem(LS_ENTRIES, JSON.stringify(list)); 
  },
  async deleteEntry(id){ 
    const list = await this.loadEntries(); 
    localStorage.setItem(LS_ENTRIES, JSON.stringify(list.filter(e=>e.id!==id))); 
  },
  async loadAuxiliaryDefinitions(){ 
    const raw = localStorage.getItem(LS_AUX_DEFINITIONS); 
    return raw ? JSON.parse(raw) : []; 
  },
  async upsertAuxiliaryDefinition(d){ 
    const list = await this.loadAuxiliaryDefinitions(); 
    const i = list.findIndex(x=>x.id===d.id); 
    if (i>=0) list[i]=d; else list.push(d); 
    list.sort((x,y)=>x.name.localeCompare(y.name)); 
    localStorage.setItem(LS_AUX_DEFINITIONS, JSON.stringify(list)); 
  },
  async deleteAuxiliaryDefinition(id){ 
    const list = await this.loadAuxiliaryDefinitions(); 
    localStorage.setItem(LS_AUX_DEFINITIONS, JSON.stringify(list.filter(d=>d.id!==id))); 
  },
  async loadAuxiliaryEntries(){
    const raw = localStorage.getItem(LS_AUXILIARY); 
    const entries = raw ? JSON.parse(raw) : [];
    
    // Calculate total_balance from movements for each entry
    const movementsRaw = localStorage.getItem(LS_AUX_MOVEMENTS);
    const allMovements: AuxiliaryMovementDetail[] = movementsRaw ? JSON.parse(movementsRaw) : [];
    
    return entries.map((entry: AuxiliaryLedgerEntry) => {
      const entryMovements = allMovements.filter(m => m.aux_entry_id === entry.id);
      const total_balance = entryMovements.reduce((sum, m) => {
        return sum + (m.movement_type === 'INCREASE' ? m.amount : -m.amount);
      }, 0);
      return { ...entry, total_balance };
    });
  },
  async upsertAuxiliaryEntry(a){ 
    const list = await this.loadAuxiliaryEntries(); 
    const { total_balance, ...entryData } = a; // Remove calculated field
    
    // Generate UUID if creating new entry
    if (!entryData.id) {
      entryData.id = crypto.randomUUID();
    }
    
    const i = list.findIndex(x=>x.id===entryData.id); 
    if (i>=0) list[i]={...list[i], ...entryData}; else list.push(entryData); 
    list.sort((x,y)=>x.client_name.localeCompare(y.client_name)); 
    localStorage.setItem(LS_AUXILIARY, JSON.stringify(list)); 
    
    // Return the saved entry with calculated total_balance
    return list.find(x => x.id === entryData.id)!;
  },
  async deleteAuxiliaryEntry(id){ 
    const list = await this.loadAuxiliaryEntries(); 
    localStorage.setItem(LS_AUXILIARY, JSON.stringify(list.filter(a=>a.id!==id))); 
  },
  async loadAuxiliaryDetails(auxEntryId: string): Promise<AuxiliaryMovementDetail[]> {
    const raw = localStorage.getItem(LS_AUX_MOVEMENTS);
    const allMovements: AuxiliaryMovementDetail[] = raw ? JSON.parse(raw) : [];
    return allMovements
      .filter(m => m.aux_entry_id === auxEntryId)
      .sort((a, b) => b.movement_date.localeCompare(a.movement_date));
  },
  async upsertAuxiliaryMovementDetails(details: AuxiliaryMovementDetail[]): Promise<void> {
    const raw = localStorage.getItem(LS_AUX_MOVEMENTS);
    const allMovements: AuxiliaryMovementDetail[] = raw ? JSON.parse(raw) : [];
    
    for (const detail of details) {
      // Generate UUID if creating new movement
      if (!detail.id) {
        detail.id = crypto.randomUUID();
      }
      
      const i = allMovements.findIndex(m => m.id === detail.id);
      if (i >= 0) allMovements[i] = detail;
      else allMovements.push(detail);
    }
    
    localStorage.setItem(LS_AUX_MOVEMENTS, JSON.stringify(allMovements));
    
    // Automatic reopening: Check if any affected clients are closed and reopen them
    const affectedClientIds = Array.from(new Set(details.map(d => d.aux_entry_id)));
    const entries = await this.loadAuxiliaryEntries();
    
    for (const auxId of affectedClientIds) {
      const entry = entries.find(e => e.id === auxId);
      if (entry?.closed_date) {
        await this.reopenAuxiliaryEntry(auxId);
      }
    }
  },
  async loadKardexDefinitions() {
    return []; // LocalStorage no soporta kárdex definitions
  },
  async loadClosingBalances(quarterEndDate: string): Promise<Record<string, number>> {
    const raw = localStorage.getItem(`closures_${quarterEndDate}`);
    if (raw) return JSON.parse(raw);
    
    // Calculate balances if no closure exists
    const entries = await this.loadEntries();
    const accounts = await this.loadAccounts();
    const balances: Record<string, number> = {};
    
    // Filter entries up to quarter end date
    const relevantEntries = entries.filter(e => e.date <= quarterEndDate);
    
    for (const account of accounts) {
      let debit = 0;
      let credit = 0;
      
      for (const entry of relevantEntries) {
        for (const line of entry.lines) {
          if (line.account_id === account.id) {
            debit += line.debit;
            credit += line.credit;
          }
        }
      }
      
      // Calculate signed balance based on account normal side
      const balance = account.normal_side === "DEBE" ? (debit - credit) : (credit - debit);
      if (balance !== 0) {
        balances[account.id] = balance;
      }
    }
    
    return balances;
  },
  async saveClosingBalances(quarterEndDate: string, balances: Record<string, number>): Promise<void> {
    localStorage.setItem(`closures_${quarterEndDate}`, JSON.stringify(balances));
  },
  async closeAuxiliaryEntry(id: string, closureDate: string): Promise<void> {
    const entries = await this.loadAuxiliaryEntries();
    const entry = entries.find(e => e.id === id);
    if (entry) {
      (entry as any).closed_date = closureDate;
      localStorage.setItem(LS_AUXILIARY, JSON.stringify(entries));
    }
  },
  async reopenAuxiliaryEntry(id: string): Promise<void> {
    const entries = await this.loadAuxiliaryEntries();
    const entry = entries.find(e => e.id === id);
    if (entry) {
      delete (entry as any).closed_date;
      localStorage.setItem(LS_AUXILIARY, JSON.stringify(entries));
    }
  },
};

/**
 * Crea un SupabaseAdapter acotado a una empresa específica.
 * Todas las lecturas filtran por company_id y todas las escrituras
 * usan ese mismo company_id en lugar del valor hardcodeado.
 */
export function createSupaAdapter(companyId: string): IDataAdapter {
  const adapter: IDataAdapter = {
    async loadAccounts(){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadAccounts();
      const data = await fetchAllPaginated<Account>((from, to) =>
        supa.from("accounts")
          .select("id,name,type,normal_side,is_active,expense_category,is_cash_equivalent,is_current,clasificacion_resultado,subclasificacion_resultado,clasificacion_flujo,es_partida_no_monetaria,es_capital_trabajo,es_financiera,es_extraordinaria,afecta_ebitda")
          .eq("company_id", companyId)
          .order("id")
          .range(from, to)
      );
      return data;
    },
    async upsertAccount(a){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.upsertAccount(a);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");
      const accountWithUser = {
        ...a,
        user_id: user.id,
        company_id: companyId,
        expense_category: a.expense_category ?? null,
        is_cash_equivalent: a.is_cash_equivalent ?? false,
        is_current: a.is_current ?? null,
        clasificacion_resultado: a.clasificacion_resultado ?? null,
        subclasificacion_resultado: a.subclasificacion_resultado ?? null,
        clasificacion_flujo: a.clasificacion_flujo ?? 'no_aplica',
        es_partida_no_monetaria: a.es_partida_no_monetaria ?? false,
        es_capital_trabajo: a.es_capital_trabajo ?? false,
        es_financiera: a.es_financiera ?? false,
        es_extraordinaria: a.es_extraordinaria ?? false,
        afecta_ebitda: a.afecta_ebitda ?? true,
      };
      const { error } = await supa.from("accounts").upsert(accountWithUser);
      if (error) throw error;
    },
    async deleteAccount(id){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.deleteAccount(id);
      const { error } = await supa.from("accounts").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    async loadEntries(){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadEntries();
      const heads = await fetchAllPaginated<any>((from, to) =>
        supa.from("journal_entries")
          .select("id,date,memo,void_of")
          .eq("company_id", companyId)
          .order("date")
          .range(from, to)
      );
      const ids = heads.map(h => h.id); if (ids.length === 0) return [];
      const allLines: any[] = [];
      for (const idsChunk of chunk(ids, 300)) {
        const part = await fetchAllPaginated<any>((from, to) =>
          supa.from("journal_lines")
            .select("entry_id,account_id,debit,credit,line_memo")
            .in("entry_id", idsChunk)
            .range(from, to)
        );
        allLines.push(...part);
      }
      const map = new Map<string, JournalEntry>();
      for (const h of heads) map.set(h.id, { id: h.id, date: String(h.date), memo: h.memo || undefined, void_of: h.void_of || undefined, lines: [] });
      for (const l of allLines) { const e = map.get(l.entry_id)!; if (e) e.lines.push({ account_id: l.account_id, debit: Number(l.debit)||0, credit: Number(l.credit)||0, line_memo: l.line_memo||undefined }); }
      return Array.from(map.values()).filter(e => e.lines.length > 0).sort((a,b)=> cmpDate(a.date,b.date) || a.id.localeCompare(b.id));
    },
    async saveEntry(e){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.saveEntry(e);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");
      const { error: e1 } = await supa.from("journal_entries").upsert({ id: e.id, date: e.date, memo: e.memo||null, void_of: e.void_of||null, user_id: user.id, company_id: companyId });
      if (e1) throw e1;
      const { error: eDel } = await supa.from("journal_lines").delete().eq("entry_id", e.id);
      if (eDel) throw eDel;
      const payload = e.lines.map(l=> ({ entry_id: e.id, account_id: l.account_id, debit: round2(l.debit), credit: round2(l.credit), line_memo: l.line_memo||null }));
      const { error: e2 } = await supa.from("journal_lines").insert(payload);
      if (e2) throw e2;
    },
    async deleteEntry(id){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.deleteEntry(id);
      const { error: e1 } = await supa.from("journal_lines").delete().eq("entry_id", id);
      if (e1) throw e1;
      const { error: e2 } = await supa.from("journal_entries").delete().eq("id", id).eq("company_id", companyId);
      if (e2) throw e2;
    },
    async loadAuxiliaryDefinitions(){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadAuxiliaryDefinitions();
      const data = await fetchAllPaginated<AuxiliaryLedgerDefinition>((from, to) =>
        supa.from("auxiliary_ledger_definitions")
          .select("id,name,account_id")
          .eq("company_id", companyId)
          .order("name")
          .range(from, to)
      );
      return data;
    },
    async upsertAuxiliaryDefinition(d){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.upsertAuxiliaryDefinition(d);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");
      const defWithUser = { ...d, user_id: user.id, company_id: companyId };
      const { error } = await supa.from("auxiliary_ledger_definitions").upsert(defWithUser);
      if (error) throw error;
    },
    async deleteAuxiliaryDefinition(id){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.deleteAuxiliaryDefinition(id);
      const { error } = await supa.from("auxiliary_ledger_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    async loadAuxiliaryEntries(){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadAuxiliaryEntries();
      const entries = await fetchAllPaginated<any>((from, to) =>
        supa.from("auxiliary_ledger")
          .select("id,client_name,account_id,definition_id,closed_date")
          .eq("company_id", companyId)
          .order("client_name")
          .range(from, to)
      );
      if (entries.length === 0) return [];

      const entryIds = entries.map(e => e.id);
      const allMovements: any[] = [];
      for (const idsChunk of chunk(entryIds, 300)) {
        const part = await fetchAllPaginated<any>((from, to) =>
          supa.from("auxiliary_movement_details")
            .select("aux_entry_id,movement_type,amount")
            .in("aux_entry_id", idsChunk)
            .range(from, to)
        );
        allMovements.push(...part);
      }

      const movementsByEntry = new Map<string, AuxiliaryMovementDetail[]>();
      for (const mov of allMovements) {
        const entryMovs = movementsByEntry.get((mov as any).aux_entry_id) || [];
        entryMovs.push(mov as any);
        movementsByEntry.set((mov as any).aux_entry_id, entryMovs);
      }

      const result: AuxiliaryLedgerEntry[] = entries.map(entry => {
        const movements = movementsByEntry.get(entry.id) || [];
        const total_balance = movements.reduce((sum, m) => {
          return sum + (m.movement_type === 'INCREASE' ? m.amount : -m.amount);
        }, 0);
        return { ...entry, total_balance };
      });

      return result;
    },
    async upsertAuxiliaryEntry(a){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.upsertAuxiliaryEntry(a);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const auxData = {
        id: a.id,
        client_name: a.client_name,
        account_id: a.account_id,
        definition_id: a.definition_id
      };

      const isNew = !auxData.id || auxData.id.includes('-');
      if (isNew) { auxData.id = crypto.randomUUID(); }

      const auxWithUser = { ...auxData, user_id: user.id, company_id: companyId };

      let savedEntry;
      if (isNew) {
        const { data, error } = await supa
          .from("auxiliary_ledger")
          .insert(auxWithUser)
          .select("id,client_name,account_id,definition_id")
          .single();
        if (error) throw error;
        savedEntry = data;
      } else {
        const { data, error } = await supa
          .from("auxiliary_ledger")
          .update(auxWithUser)
          .eq("id", auxData.id)
          .select("id,client_name,account_id,definition_id")
          .single();
        if (error) throw error;
        savedEntry = data;
      }

      const movements = await adapter.loadAuxiliaryDetails(savedEntry.id);
      const calculatedBalance = movements.reduce((sum, m) => {
        return sum + (m.movement_type === 'INCREASE' ? m.amount : -m.amount);
      }, 0);

      return { ...savedEntry, total_balance: calculatedBalance } as AuxiliaryLedgerEntry;
    },
    async deleteAuxiliaryEntry(id){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.deleteAuxiliaryEntry(id);
      const { error } = await supa.from("auxiliary_ledger").delete().eq("id", id);
      if (error) throw error;
    },
    async loadAuxiliaryDetails(auxEntryId: string): Promise<AuxiliaryMovementDetail[]> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadAuxiliaryDetails(auxEntryId);
      const data = await fetchAllPaginated<AuxiliaryMovementDetail>((from, to) =>
        supa.from("auxiliary_movement_details")
          .select("id,aux_entry_id,journal_entry_id,movement_date,amount,movement_type")
          .eq("aux_entry_id", auxEntryId)
          .order("movement_date", { ascending: false })
          .range(from, to)
      );
      return data;
    },
    async upsertAuxiliaryMovementDetails(details: AuxiliaryMovementDetail[]): Promise<void> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.upsertAuxiliaryMovementDetails(details);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const payload = details.map(d => {
        const detailCopy = { ...d, user_id: user.id, company_id: companyId };
        if (!detailCopy.id || detailCopy.id.includes('-')) { delete detailCopy.id; }
        return detailCopy;
      });

      const { error } = await supa.from("auxiliary_movement_details").insert(payload);
      if (error) throw error;

      const affectedClientIds = Array.from(new Set(details.map(d => d.aux_entry_id)));
      const entries = await adapter.loadAuxiliaryEntries();

      for (const auxId of affectedClientIds) {
        const entry = entries.find(e => e.id === auxId);
        if (entry?.closed_date) { await adapter.reopenAuxiliaryEntry(auxId); }
      }
    },
    async loadKardexDefinitions(){
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadKardexDefinitions();
      const data = await fetchAllPaginated<KardexDefinition>((from, to) =>
        supa.from("kardex_definitions")
          .select("id,name,account_id,user_id,created_at")
          .eq("company_id", companyId)
          .order("name")
          .range(from, to)
      );
      return data;
    },
    async loadClosingBalances(quarterEndDate: string): Promise<Record<string, number>> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.loadClosingBalances(quarterEndDate);

      const { data, error } = await supa
        .from("quarterly_closures")
        .select("balances")
        .eq("closure_date", quarterEndDate)
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data.balances as Record<string, number>;

      const entries = await adapter.loadEntries();
      const accounts = await adapter.loadAccounts();
      const balances: Record<string, number> = {};
      const relevantEntries = entries.filter(e => e.date <= quarterEndDate);

      for (const account of accounts) {
        let debit = 0; let credit = 0;
        for (const entry of relevantEntries) {
          for (const line of entry.lines) {
            if (line.account_id === account.id) { debit += line.debit; credit += line.credit; }
          }
        }
        const balance = account.normal_side === "DEBE" ? (debit - credit) : (credit - debit);
        if (balance !== 0) { balances[account.id] = balance; }
      }

      return balances;
    },
    async saveClosingBalances(quarterEndDate: string, balances: Record<string, number>): Promise<void> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.saveClosingBalances(quarterEndDate, balances);
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");
      const { error } = await supa.from("quarterly_closures").upsert({
        user_id: user.id,
        company_id: companyId,
        closure_date: quarterEndDate,
        balances
      });
      if (error) throw error;
    },
    async closeAuxiliaryEntry(id: string, closureDate: string): Promise<void> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.closeAuxiliaryEntry(id, closureDate);
      const { error } = await supa.from('auxiliary_ledger').update({ closed_date: closureDate }).eq('id', id).eq('company_id', companyId);
      if (error) throw error;
    },
    async reopenAuxiliaryEntry(id: string): Promise<void> {
      const supa = await getSupabase(); if (!supa) return LocalAdapter.reopenAuxiliaryEntry(id);
      const { error } = await supa.from('auxiliary_ledger').update({ closed_date: null }).eq('id', id).eq('company_id', companyId);
      if (error) throw error;
    },
  };
  return adapter;
}

/** Instancia legacy para compatibilidad (apunta a DEFAULT_COMPANY_ID) */
export const SupaAdapter: IDataAdapter = createSupaAdapter(DEFAULT_COMPANY_ID);

// Elegir adapter dinámicamente
export async function pickAdapter(companyId: string = DEFAULT_COMPANY_ID): Promise<IDataAdapter> {
  const supa = await getSupabase();
  if (!supa) return LocalAdapter;
  try {
    const { error } = await supa.from("accounts").select("id").limit(1);
    if (error) return LocalAdapter;
    return createSupaAdapter(companyId);
  } catch { return LocalAdapter; }
}