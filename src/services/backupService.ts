// src/services/backupService.ts
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/accounting/data-adapter';

// ─── HMAC helpers (Web Crypto API — no external deps) ──────────────────────────

/** Derives an HMAC-SHA256 key from the user's ID using PBKDF2. */
async function deriveHmacKey(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('erpbv-backup-salt-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Returns a hex HMAC-SHA256 of the given payload string. */
async function signPayload(payload: string, userId: string): Promise<string> {
  const key = await deriveHmacKey(userId);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Returns true if the HMAC of payload matches the provided signature. */
async function verifyPayload(payload: string, signature: string, userId: string): Promise<boolean> {
  try {
    const expected = await signPayload(payload, userId);
    // Constant-time comparison to prevent timing attacks
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/** Paginated SELECT * WHERE user_id = ? to bypass PostgREST 1000-row default limit. */
async function fetchAllUserRows(table: string, userId: string): Promise<any[]> {
  return await fetchAllPaginated<any>((from, to) =>
    supabase.from(table as any).select('*').eq('user_id', userId).range(from, to)
  );
}

/** Paginated journal_lines via inner join on journal_entries.user_id. */
async function fetchAllJournalLines(userId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('journal_lines')
      .select('*, journal_entries!inner(user_id)')
      .eq('journal_entries.user_id', userId)
      .range(from, to)
  );
  return rows.map(({ journal_entries, ...line }: any) => line);
}

/** Returns the first company_id that the user belongs to. */
async function getUserCompanyId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error('No se encontró compañía asociada al usuario');
  }
  return (data as any).company_id;
}

/** Paginated SELECT * WHERE company_id = ? for tables without user_id. */
async function fetchAllCompanyRows(table: string, companyId: string): Promise<any[]> {
  return await fetchAllPaginated<any>((from, to) =>
    supabase.from(table as any).select('*').eq('company_id', companyId).range(from, to)
  );
}

/** Paginated sale_items via inner join on sales.user_id (no own user_id column). */
async function fetchAllSaleItems(userId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('sale_items')
      .select('*, sales!inner(user_id)')
      .eq('sales.user_id', userId)
      .range(from, to)
  );
  return rows.map(({ sales, ...item }: any) => item);
}

export interface BackupData {
  version: string;
  created_at: string;
  /** HMAC-SHA256 signature of the backup payload (added at download time). Optional for backward compat with old backups. */
  hmac?: string;
  accounts: any[];
  journal_entries: any[];
  journal_lines: any[];
  auxiliary_ledger_definitions: any[];
  auxiliary_ledger: any[];
  auxiliary_movement_details: any[];
  kardex_definitions: any[];
  kardex_entries: any[];
  kardex_movements: any[];
  quarterly_closures: any[];
  // v2.0 fields (optional for backward compat)
  products?: any[];
  inventory_movements?: any[];
  inventory_lots?: any[];
  import_lots?: any[];
  cost_sheets?: any[];
  cost_sheet_cells?: any[];
  report_settings?: any[];
  shipments?: any[];
  sales?: any[];
  sale_items?: any[];
  // v2.1 fields
  fiscal_years?: any[];
  // v2.2 fields
  customers?: any[];
  receivables?: any[];
  payables?: any[];
  debt_payments?: any[];
  // v2.3 fields
  member_permissions?: any[];
  company_module_config?: any[];
}

export async function createFullBackup(): Promise<BackupData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const companyId = await getUserCompanyId(user.id);

  const [
    accounts,
    journal_entries,
    journal_lines,
    auxiliary_ledger_definitions,
    auxiliary_ledger,
    auxiliary_movement_details,
    kardex_definitions,
    kardex_entries,
    kardex_movements,
    quarterly_closures,
    products,
    inventory_movements,
    inventory_lots,
    import_lots,
    cost_sheets,
    cost_sheet_cells,
    report_settings,
    shipments,
    sales,
    sale_items,
    fiscal_years,
    customers,
    receivables,
    payables,
    debt_payments,
    member_permissions,
    company_module_config,
  ] = await Promise.all([
    fetchAllUserRows('accounts', user.id),
    fetchAllUserRows('journal_entries', user.id),
    fetchAllJournalLines(user.id),
    fetchAllUserRows('auxiliary_ledger_definitions', user.id),
    fetchAllUserRows('auxiliary_ledger', user.id),
    fetchAllUserRows('auxiliary_movement_details', user.id),
    fetchAllUserRows('kardex_definitions', user.id),
    fetchAllUserRows('kardex_entries', user.id),
    fetchAllUserRows('kardex_movements', user.id),
    fetchAllUserRows('quarterly_closures', user.id),
    fetchAllUserRows('products', user.id),
    fetchAllUserRows('inventory_movements', user.id),
    fetchAllUserRows('inventory_lots', user.id),
    fetchAllUserRows('import_lots', user.id),
    fetchAllUserRows('cost_sheets', user.id),
    fetchAllUserRows('cost_sheet_cells', user.id),
    fetchAllUserRows('report_settings', user.id),
    fetchAllUserRows('shipments', user.id),
    fetchAllUserRows('sales', user.id),
    fetchAllSaleItems(user.id),
    fetchAllCompanyRows('fiscal_years', companyId),
    fetchAllUserRows('customers', user.id),
    fetchAllUserRows('receivables', user.id),
    fetchAllUserRows('payables', user.id),
    fetchAllUserRows('debt_payments', user.id),
    // member_permissions: join a través de company_members para filtrar por empresa
    fetchAllPaginated<any>((from, to) =>
      supabase.from('member_permissions')
        .select('*, company_members!inner(company_id)')
        .eq('company_members.company_id', companyId)
        .range(from, to)
    ).then(rows => rows.map(({ company_members: _cm, id: _id, ...r }: any) => r)),
    fetchAllCompanyRows('company_module_config', companyId)
      .then(rows => rows.map(({ id: _id, ...r }) => r)),
  ]);

  return {
    version: '2.3',
    created_at: new Date().toISOString(),
    accounts,
    journal_entries,
    journal_lines,
    auxiliary_ledger_definitions,
    auxiliary_ledger,
    auxiliary_movement_details,
    kardex_definitions,
    kardex_entries,
    kardex_movements,
    quarterly_closures,
    products,
    inventory_movements,
    inventory_lots,
    import_lots,
    cost_sheets,
    cost_sheet_cells,
    report_settings,
    shipments,
    sales,
    sale_items,
    fiscal_years,
    customers,
    receivables,
    payables,
    debt_payments,
    member_permissions,
    company_module_config,
  };
}

export async function downloadBackup(data: BackupData): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  // Sign the payload (without any prior hmac field) so the signature covers all data
  const { hmac: _existing, ...dataWithoutHmac } = data;
  const payload = JSON.stringify(dataWithoutHmac);

  let signedData: BackupData = dataWithoutHmac;
  if (user) {
    const hmac = await signPayload(payload, user.id);
    signedData = { ...dataWithoutHmac, hmac };
  }

  const json = JSON.stringify(signedData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-contabilidad-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreFromBackup(backup: BackupData): Promise<{ success: boolean; message: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  // Helper: delete with error check
  const safeDelete = async (table: string) => {
    const { error } = await (supabase.from(table as any) as any).delete().eq('user_id', user.id);
    if (error) throw new Error(`Error limpiando ${table}: ${error.message}`);
  };

  // Helper: chunked insert to avoid payload limits & partial failures
  const chunkedInsert = async (table: string, rows: any[], chunkSize = 500) => {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await (supabase.from(table as any) as any).insert(chunk);
      if (error) throw new Error(`Error insertando en ${table} (lote ${i / chunkSize + 1}): ${error.message}`);
    }
  };

  try {
    // Resolve company scope for tables that use company_id instead of user_id
    const userCompanyIdForRestore = await getUserCompanyId(user.id);

    // Delete existing data in reverse order of dependencies
    // journal_lines are deleted via CASCADE when journal_entries are deleted
    // auxiliary_movement_details and inventory_movements are deleted via triggers on journal_entries delete

    // company_module_config: scoped by company_id
    const { error: cmcDelError } = await supabase
      .from('company_module_config')
      .delete()
      .eq('company_id', userCompanyIdForRestore);
    if (cmcDelError) throw new Error(`Error limpiando company_module_config: ${cmcDelError.message}`);

    // member_permissions: borrar via company_members de la empresa
    const { data: memberIds } = await supabase
      .from('company_members')
      .select('id')
      .eq('company_id', userCompanyIdForRestore);
    if (memberIds && memberIds.length > 0) {
      const ids = memberIds.map((m: any) => m.id);
      const { error: mpDelError } = await supabase
        .from('member_permissions')
        .delete()
        .in('company_member_id', ids);
      if (mpDelError) throw new Error(`Error limpiando member_permissions: ${mpDelError.message}`);
    }

    // fiscal_years: scoped by company_id, not user_id
    const { error: fyDelError } = await supabase
      .from('fiscal_years')
      .delete()
      .eq('company_id', userCompanyIdForRestore);
    if (fyDelError) throw new Error(`Error limpiando fiscal_years: ${fyDelError.message}`);

    await safeDelete('shipments');
    // debt_payments and receivables/payables must go before sales (FK references)
    await safeDelete('debt_payments');
    await safeDelete('receivables');
    await safeDelete('payables');
    await safeDelete('customers');
    // sale_items must go before sales (no user_id column — delete by matching sale IDs)
    const { data: userSaleIds } = await supabase
      .from('sales')
      .select('id')
      .eq('user_id', user.id);
    if (userSaleIds && userSaleIds.length > 0) {
      const saleIds = userSaleIds.map((s: any) => s.id);
      const { error: saleItemsDelError } = await supabase
        .from('sale_items')
        .delete()
        .in('sale_id', saleIds);
      if (saleItemsDelError) throw new Error(`Error limpiando sale_items: ${saleItemsDelError.message}`);
    }
    await safeDelete('sales');
    await safeDelete('auxiliary_movement_details');
    await safeDelete('auxiliary_ledger');
    await safeDelete('auxiliary_ledger_definitions');
    await safeDelete('kardex_movements');
    await safeDelete('kardex_entries');
    await safeDelete('kardex_definitions');
    await safeDelete('quarterly_closures');
    await safeDelete('inventory_movements');
    await safeDelete('inventory_lots');
    await safeDelete('import_lots');
    await safeDelete('cost_sheet_cells');
    await safeDelete('cost_sheets');
    await safeDelete('products');
    await safeDelete('report_settings');
    // Delete journal_lines explicitly first (no user_id column, so use entry_id via RLS)
    // Then journal_entries
    const { error: linesDelError } = await supabase
      .from('journal_lines')
      .delete()
      .gte('id', 0); // RLS will scope to user's entries
    if (linesDelError) throw new Error(`Error limpiando journal_lines: ${linesDelError.message}`);
    await safeDelete('journal_entries');
    await safeDelete('accounts');

    // Insert new data with correct user_id
    if (backup.accounts.length > 0) {
      const accounts = backup.accounts.map(a => ({ ...a, user_id: user.id }));
      await chunkedInsert('accounts', accounts);
    }

    if (backup.journal_entries.length > 0) {
      const entries = backup.journal_entries.map(e => ({ ...e, user_id: user.id }));
      await chunkedInsert('journal_entries', entries);
    }

    if (backup.journal_lines.length > 0) {
      // Strip auto-generated id to let DB regenerate (avoids sequence conflicts)
      const lines = backup.journal_lines.map(({ id, ...rest }: any) => rest);
      await chunkedInsert('journal_lines', lines);
    }

    if (backup.auxiliary_ledger_definitions?.length) {
      const defs = backup.auxiliary_ledger_definitions.map(d => ({ ...d, user_id: user.id }));
      await chunkedInsert('auxiliary_ledger_definitions', defs);
    }

    if (backup.auxiliary_ledger?.length) {
      const ledger = backup.auxiliary_ledger.map(l => ({ ...l, user_id: user.id }));
      await chunkedInsert('auxiliary_ledger', ledger);
    }

    if (backup.auxiliary_movement_details?.length) {
      const movements = backup.auxiliary_movement_details.map(m => ({ ...m, user_id: user.id }));
      await chunkedInsert('auxiliary_movement_details', movements);
    }

    if (backup.kardex_definitions?.length) {
      const defs = backup.kardex_definitions.map(d => ({ ...d, user_id: user.id }));
      await chunkedInsert('kardex_definitions', defs);
    }

    if (backup.kardex_entries?.length) {
      const entries = backup.kardex_entries.map(e => ({ ...e, user_id: user.id }));
      await chunkedInsert('kardex_entries', entries);
    }

    if (backup.kardex_movements?.length) {
      const movements = backup.kardex_movements.map(m => ({ ...m, user_id: user.id }));
      await chunkedInsert('kardex_movements', movements);
    }

    if (backup.quarterly_closures?.length) {
      const closures = backup.quarterly_closures.map(c => ({ ...c, user_id: user.id }));
      await chunkedInsert('quarterly_closures', closures);
    }

    // v2.0 tables
    if (backup.products?.length) {
      const products = backup.products.map(p => ({ ...p, user_id: user.id }));
      await chunkedInsert('products', products);
    }

    if (backup.import_lots?.length) {
      const lots = backup.import_lots.map(l => ({ ...l, user_id: user.id }));
      await chunkedInsert('import_lots', lots);
    }

    if (backup.inventory_lots?.length) {
      const lots = backup.inventory_lots.map(l => ({ ...l, user_id: user.id }));
      await chunkedInsert('inventory_lots', lots);
    }

    if (backup.inventory_movements?.length) {
      const movements = backup.inventory_movements.map(m => ({ ...m, user_id: user.id }));
      await chunkedInsert('inventory_movements', movements);
    }

    if (backup.cost_sheets?.length) {
      const sheets = backup.cost_sheets.map(s => ({ ...s, user_id: user.id }));
      await chunkedInsert('cost_sheets', sheets);
    }

    if (backup.cost_sheet_cells?.length) {
      const cells = backup.cost_sheet_cells.map(c => ({ ...c, user_id: user.id }));
      await chunkedInsert('cost_sheet_cells', cells);
    }

    if (backup.report_settings?.length) {
      const settings = backup.report_settings.map(s => ({ ...s, user_id: user.id }));
      await chunkedInsert('report_settings', settings);
    }

    // Shipments (now in Supabase)
    if (backup.shipments?.length) {
      // Handle both old format (full Shipment objects) and new format (DB rows)
      const shipmentRows = backup.shipments.map((s: any) => {
        if (s.user_id && s.data) {
          // Already in DB row format
          return { ...s, user_id: user.id };
        }
        // Old localStorage format — convert
        const { id, numero, status, ...rest } = s;
        return { id, user_id: user.id, numero, status, data: rest };
      });
      await chunkedInsert('shipments', shipmentRows);
    }

    // Sales (must come AFTER journal_entries since they reference journal_entry_id)
    if (backup.sales?.length) {
      const sales = backup.sales.map((s: any) => ({ ...s, user_id: user.id }));
      await chunkedInsert('sales', sales);
    }

    if (backup.sale_items?.length) {
      // sale_items has no user_id; just reinsert as-is
      await chunkedInsert('sale_items', backup.sale_items);
    }

    // v2.1: fiscal_years (scoped by company_id, not user_id)
    if (backup.fiscal_years?.length) {
      const fiscalYears = backup.fiscal_years.map((fy: any) => ({
        ...fy,
        company_id: userCompanyIdForRestore,
        // closed_by is preserved as-is (may be null or a valid user UUID)
      }));
      await chunkedInsert('fiscal_years', fiscalYears);
    }

    // v2.2: customers, receivables, payables, debt_payments
    // customers must come before receivables (FK: receivables.customer_id → customers.id)
    if (backup.customers?.length) {
      const rows = backup.customers.map((c: any) => ({ ...c, user_id: user.id }));
      await chunkedInsert('customers', rows);
    }

    // receivables and payables are independent of each other
    if (backup.receivables?.length) {
      const rows = backup.receivables.map((r: any) => ({ ...r, user_id: user.id }));
      await chunkedInsert('receivables', rows);
    }

    if (backup.payables?.length) {
      const rows = backup.payables.map((p: any) => ({ ...p, user_id: user.id }));
      await chunkedInsert('payables', rows);
    }

    // debt_payments must come after receivables and payables (FKs to both)
    if (backup.debt_payments?.length) {
      const rows = backup.debt_payments.map((d: any) => ({ ...d, user_id: user.id }));
      await chunkedInsert('debt_payments', rows);
    }

    // v2.3: member_permissions y company_module_config
    if (backup.company_module_config?.length) {
      const rows = backup.company_module_config.map((r: any) => ({
        ...r,
        company_id: userCompanyIdForRestore,
      }));
      await chunkedInsert('company_module_config', rows);
    }

    if (backup.member_permissions?.length) {
      // Solo el owner de la empresa puede restaurar permisos de miembros
      const { data: ownerCheck } = await supabase
        .from('company_members')
        .select('id, role')
        .eq('company_id', userCompanyIdForRestore)
        .eq('user_id', user.id)
        .maybeSingle();
      if (ownerCheck?.role === 'owner') {
        // Strip id to avoid PK conflicts; company_member_id is remapped to current member
        const rows = backup.member_permissions.map((r: any) => {
          const { id: _id, ...rest } = r;
          return { ...rest, company_member_id: ownerCheck.id };
        });
        await chunkedInsert('member_permissions', rows);
      }
      // Non-owners: skip silently — their permissions remain as set by the owner
    }

    const extras = [];
    if (backup.products?.length) extras.push(`${backup.products.length} productos`);
    if (backup.shipments?.length) extras.push(`${backup.shipments.length} embarques`);
    if (backup.sales?.length) extras.push(`${backup.sales.length} ventas`);
    if (backup.fiscal_years?.length) extras.push(`${backup.fiscal_years.length} gestiones fiscales`);
    if (backup.customers?.length) extras.push(`${backup.customers.length} clientes`);
    if (backup.receivables?.length) extras.push(`${backup.receivables.length} CxC`);
    if (backup.payables?.length) extras.push(`${backup.payables.length} CxP`);
    if (backup.debt_payments?.length) extras.push(`${backup.debt_payments.length} pagos`);
    if (backup.member_permissions?.length) extras.push(`${backup.member_permissions.length} permisos`);
    if (backup.company_module_config?.length) extras.push(`${backup.company_module_config.length} configs de módulos`);

    return { 
      success: true, 
      message: `Restauración completada: ${backup.accounts.length} cuentas, ${backup.journal_entries.length} asientos${extras.length ? ', ' + extras.join(', ') : ''}` 
    };
  } catch (error: any) {
    return { 
      success: false, 
      message: `Error en restauración: ${error.message}` 
    };
  }
}

/** Verifies the HMAC of a backup file. Returns null if no HMAC present (old format). */
export async function verifyBackupIntegrity(data: any): Promise<{ valid: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { valid: false, error: 'Usuario no autenticado' };

  if (!data.hmac) {
    // Old backup without signature — warn but allow
    return { valid: true, error: 'Advertencia: este backup no tiene firma de integridad (formato antiguo).' };
  }

  const { hmac, ...dataWithoutHmac } = data;
  const payload = JSON.stringify(dataWithoutHmac);
  const ok = await verifyPayload(payload, hmac, user.id);

  if (!ok) {
    return { valid: false, error: 'La firma del backup no es válida. El archivo puede haber sido alterado o pertenecer a otro usuario.' };
  }

  return { valid: true };
}

export function validateBackupFile(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Archivo no es un JSON válido' };
  }

  if (!data.version) {
    return { valid: false, error: 'Archivo no tiene versión de backup' };
  }

  const requiredArrays = [
    'accounts',
    'journal_entries',
    'journal_lines'
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) {
      return { valid: false, error: `Falta o es inválido el campo: ${key}` };
    }
  }

  // Optional arrays must be arrays if present (not arbitrary objects or primitives)
  const optionalArrays = [
    'auxiliary_ledger_definitions', 'auxiliary_ledger', 'auxiliary_movement_details',
    'kardex_definitions', 'kardex_entries', 'kardex_movements', 'quarterly_closures',
    'products', 'inventory_movements', 'inventory_lots', 'import_lots',
    'cost_sheets', 'cost_sheet_cells', 'report_settings', 'shipments',
    'sales', 'sale_items', 'fiscal_years', 'customers', 'receivables',
    'payables', 'debt_payments', 'member_permissions', 'company_module_config',
  ];

  for (const key of optionalArrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { valid: false, error: `Campo inválido (debe ser array): ${key}` };
    }
  }

  return { valid: true };
}
