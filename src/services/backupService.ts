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

/** Paginated journal_lines via inner join on journal_entries.company_id. */
async function fetchAllJournalLines(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('journal_lines')
      .select('*, journal_entries!inner(company_id)')
      .eq('journal_entries.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ journal_entries, ...line }: any) => line);
}

/**
 * Resuelve la empresa objetivo del backup/restore.
 *
 * SIEMPRE debe pasarse la empresa ACTIVA desde la UI (useActiveCompanyId).
 * Sin ese parámetro el backup operaría sobre una empresa arbitraria — para un
 * usuario con varias empresas (holding) eso significa exportar/sobrescribir la
 * empresa equivocada (riesgo de pérdida de datos). Por eso validamos membresía.
 */
async function resolveCompanyId(userId: string, companyId?: string): Promise<string> {
  if (companyId) {
    // Verificar que el usuario realmente pertenece a esa empresa (defensa en profundidad)
    const { data, error } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error || !data) {
      throw new Error('No perteneces a la empresa indicada para el backup');
    }
    return companyId;
  }
  // Fallback legado: primera membresía. Solo se usa si la UI no pasó la empresa.
  const { data, error } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
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

/** Paginated sale_items via inner join on sales.company_id. */
async function fetchAllSaleItems(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('sale_items')
      .select('*, sales!inner(company_id)')
      .eq('sales.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ sales, ...item }: any) => item);
}

/** Paginated licitacion_productos via inner join on licitaciones.company_id. */
async function fetchAllLicitacionProductos(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('licitacion_productos')
      .select('*, licitaciones!inner(company_id)')
      .eq('licitaciones.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ licitaciones, ...row }: any) => row);
}

/** Paginated licitacion_documentos via inner join on licitaciones.company_id. */
async function fetchAllLicitacionDocumentos(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('licitacion_documentos')
      .select('*, licitaciones!inner(company_id)')
      .eq('licitaciones.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ licitaciones, ...row }: any) => row);
}

/** Paginated product_fotos via inner join on products.company_id. Los archivos
 *  binarios en el bucket `product-photos` NO se incluyen en este backup JSON
 *  (misma limitación documentada para shipment-docs/licitacion-files). */
async function fetchAllProductFotos(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('product_fotos')
      .select('*, products!inner(company_id)')
      .eq('products.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ products, ...row }: any) => row);
}

/** Paginated investment_analysis_items via inner join on investment_analyses.company_id. */
async function fetchAllInvestmentItems(companyId: string): Promise<any[]> {
  const rows = await fetchAllPaginated<any>((from, to) =>
    supabase.from('investment_analysis_items')
      .select('*, investment_analyses!inner(company_id)')
      .eq('investment_analyses.company_id', companyId)
      .range(from, to)
  );
  return rows.map(({ investment_analyses, ...row }: any) => row);
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
  // v2.4 fields
  licitaciones?: any[];
  licitacion_productos?: any[];
  licitacion_documentos?: any[];
  // v3.1 fields
  product_categories?: any[];
  // v3.2 fields — análisis de inversión
  investment_analyses?: any[];
  investment_analysis_items?: any[];
  // v3.3 fields — configuración de cuentas de venta
  company_sale_account_config?: any[];
  // v3.4 fields — Catálogo de Ventas (fotos de producto; los binarios en Storage no se respaldan)
  product_fotos?: any[];
  // v3.5 fields — marcas "publicado" por vendedor
  product_publicaciones?: any[];
}

export async function createFullBackup(activeCompanyId?: string): Promise<BackupData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const companyId = await resolveCompanyId(user.id, activeCompanyId);

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
    licitaciones,
    licitacion_productos,
    licitacion_documentos,
    product_categories,
    investment_analyses,
    investment_analysis_items,
    company_sale_account_config,
    product_fotos,
    product_publicaciones,
  ] = await Promise.all([
    fetchAllCompanyRows('accounts', companyId),
    fetchAllCompanyRows('journal_entries', companyId),
    fetchAllJournalLines(companyId),
    fetchAllCompanyRows('auxiliary_ledger_definitions', companyId),
    fetchAllCompanyRows('auxiliary_ledger', companyId),
    fetchAllCompanyRows('auxiliary_movement_details', companyId),
    fetchAllCompanyRows('kardex_definitions', companyId),
    fetchAllCompanyRows('kardex_entries', companyId),
    fetchAllCompanyRows('kardex_movements', companyId),
    fetchAllCompanyRows('quarterly_closures', companyId),
    fetchAllCompanyRows('products', companyId),
    fetchAllCompanyRows('inventory_movements', companyId),
    fetchAllCompanyRows('inventory_lots', companyId),
    fetchAllCompanyRows('import_lots', companyId),
    fetchAllCompanyRows('cost_sheets', companyId),
    fetchAllCompanyRows('cost_sheet_cells', companyId),
    fetchAllCompanyRows('report_settings', companyId),
    fetchAllCompanyRows('shipments', companyId),
    fetchAllCompanyRows('sales', companyId),
    fetchAllSaleItems(companyId),
    fetchAllCompanyRows('fiscal_years', companyId),
    fetchAllCompanyRows('customers', companyId),
    fetchAllCompanyRows('receivables', companyId),
    fetchAllCompanyRows('payables', companyId),
    fetchAllCompanyRows('debt_payments', companyId),
    // member_permissions: join a través de company_members; guarda _member_user_id
    // para poder remapear company_member_id correctamente al restaurar en otra cuenta.
    fetchAllPaginated<any>((from, to) =>
      supabase.from('member_permissions')
        .select('*, company_members!inner(company_id, user_id)')
        .eq('company_members.company_id', companyId)
        .range(from, to)
    ).then(rows => rows.map(({ company_members: cm, id: _id, ...r }: any) => ({
      ...r,
      _member_user_id: cm?.user_id ?? null,  // stored for restore remap; prefixed _ so it's clearly metadata
    }))),
    fetchAllCompanyRows('company_module_config', companyId)
      .then(rows => rows.map(({ id: _id, ...r }) => r)),
    // v2.4: licitaciones
    fetchAllCompanyRows('licitaciones', companyId),
    fetchAllLicitacionProductos(companyId),
    fetchAllLicitacionDocumentos(companyId),
    fetchAllCompanyRows('product_categories', companyId),
    // v3.2: análisis de inversión
    fetchAllCompanyRows('investment_analyses', companyId),
    fetchAllInvestmentItems(companyId),
    // v3.3: configuración de cuentas de venta
    fetchAllCompanyRows('company_sale_account_config', companyId),
    // v3.4: fotos del Catálogo de Ventas
    fetchAllProductFotos(companyId),
    // v3.5: marcas "publicado" por vendedor
    fetchAllCompanyRows('product_publicaciones', companyId),
  ]);

  return {
    version: '3.0',
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
    licitaciones,
    licitacion_productos,
    licitacion_documentos,
    product_categories,
    investment_analyses,
    investment_analysis_items,
    company_sale_account_config,
    product_fotos,
    product_publicaciones,
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

// ─── Restore internals ────────────────────────────────────────────────────────

/** Helper: delete all rows for a company in a table. Throws on DB error. */
async function safeDeleteCompany(table: string, companyId: string): Promise<void> {
  const { error } = await (supabase.from(table as any) as any).delete().eq('company_id', companyId);
  if (error) throw new Error(`Error limpiando ${table}: ${error.message}`);
}

/** Helper: chunked insert to avoid payload limits. Throws on DB error. */
async function chunkedInsert(table: string, rows: any[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await (supabase.from(table as any) as any).insert(chunk);
    if (error) throw new Error(`Error insertando en ${table} (lote ${Math.floor(i / chunkSize) + 1}): ${error.message}`);
  }
}

/**
 * Core restore logic — extracted so it can be called both for the main restore
 * and for the automatic rollback-to-snapshot if the main restore fails.
 *
 * NOTE: This is NOT a true DB transaction. Supabase/PostgREST does not expose
 * multi-statement transactions over HTTP. To mitigate partial-failure risk,
 * `restoreFromBackup` takes a pre-restore snapshot and re-calls this function
 * if the restore fails, which recovers the user's data in most failure scenarios.
 */
async function _performRestoreInternal(
  backup: BackupData,
  userId: string,
  companyId: string
): Promise<void> {

  // ── 1. DELETE phase (reverse dependency order) ────────────────────────────

  // company_module_config: scoped by company_id
  const { error: cmcDelError } = await supabase
    .from('company_module_config')
    .delete()
    .eq('company_id', companyId);
  if (cmcDelError) throw new Error(`Error limpiando company_module_config: ${cmcDelError.message}`);

  // member_permissions: delete via company_members join
  const { data: memberIds } = await supabase
    .from('company_members')
    .select('id')
    .eq('company_id', companyId);
  if (memberIds && memberIds.length > 0) {
    const ids = memberIds.map((m: any) => m.id);
    const { error: mpDelError } = await supabase
      .from('member_permissions')
      .delete()
      .in('company_member_id', ids);
    if (mpDelError) throw new Error(`Error limpiando member_permissions: ${mpDelError.message}`);
  }

  // fiscal_years: scoped by company_id
  const { error: fyDelError } = await supabase
    .from('fiscal_years')
    .delete()
    .eq('company_id', companyId);
  if (fyDelError) throw new Error(`Error limpiando fiscal_years: ${fyDelError.message}`);

  // licitaciones → cascades to licitacion_productos + licitacion_documentos
  await safeDeleteCompany('licitaciones', companyId);

  // investment_analyses → cascades to investment_analysis_items
  await safeDeleteCompany('investment_analyses', companyId);
  await safeDeleteCompany('company_sale_account_config', companyId);

  await safeDeleteCompany('shipments', companyId);
  await safeDeleteCompany('debt_payments', companyId);
  await safeDeleteCompany('receivables', companyId);
  await safeDeleteCompany('payables', companyId);
  await safeDeleteCompany('customers', companyId);

  // sale_items: RLS via parent sales → delete by matching sale IDs of this company
  const { data: companySaleIds } = await supabase
    .from('sales')
    .select('id')
    .eq('company_id', companyId);
  if (companySaleIds && companySaleIds.length > 0) {
    const saleIds = companySaleIds.map((s: any) => s.id);
    const { error: saleItemsDelError } = await supabase
      .from('sale_items')
      .delete()
      .in('sale_id', saleIds);
    if (saleItemsDelError) throw new Error(`Error limpiando sale_items: ${saleItemsDelError.message}`);
  }
  await safeDeleteCompany('sales', companyId);

  await safeDeleteCompany('auxiliary_movement_details', companyId);
  await safeDeleteCompany('auxiliary_ledger', companyId);
  await safeDeleteCompany('auxiliary_ledger_definitions', companyId);
  await safeDeleteCompany('kardex_movements', companyId);
  await safeDeleteCompany('kardex_entries', companyId);
  await safeDeleteCompany('kardex_definitions', companyId);
  await safeDeleteCompany('quarterly_closures', companyId);
  await safeDeleteCompany('inventory_movements', companyId);
  await safeDeleteCompany('inventory_lots', companyId);
  await safeDeleteCompany('import_lots', companyId);
  await safeDeleteCompany('cost_sheet_cells', companyId);
  await safeDeleteCompany('cost_sheets', companyId);
  await safeDeleteCompany('products', companyId);
  await safeDeleteCompany('product_categories', companyId);
  await safeDeleteCompany('report_settings', companyId);

  // journal_lines: RLS via parent journal_entries → delete by matching entry IDs of this company
  const { data: companyEntryIds } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId);
  if (companyEntryIds && companyEntryIds.length > 0) {
    const entryIds = companyEntryIds.map((e: any) => e.id);
    const { error: linesDelError } = await supabase
      .from('journal_lines')
      .delete()
      .in('entry_id', entryIds);
    if (linesDelError) throw new Error(`Error limpiando journal_lines: ${linesDelError.message}`);
  }
  await safeDeleteCompany('journal_entries', companyId);
  await safeDeleteCompany('accounts', companyId);

  // ── 2. INSERT phase (forward dependency order) ────────────────────────────

  if (backup.accounts.length > 0) {
    await chunkedInsert('accounts', backup.accounts.map(a => ({ ...a, user_id: userId })));
  }

  if (backup.journal_entries.length > 0) {
    await chunkedInsert('journal_entries', backup.journal_entries.map(e => ({ ...e, user_id: userId })));
  }

  if (backup.journal_lines.length > 0) {
    // Strip auto-generated id to let DB regenerate (avoids sequence conflicts)
    await chunkedInsert('journal_lines', backup.journal_lines.map(({ id: _id, ...rest }: any) => rest));
  }

  if (backup.auxiliary_ledger_definitions?.length) {
    await chunkedInsert('auxiliary_ledger_definitions', backup.auxiliary_ledger_definitions.map(d => ({ ...d, user_id: userId })));
  }
  if (backup.auxiliary_ledger?.length) {
    await chunkedInsert('auxiliary_ledger', backup.auxiliary_ledger.map(l => ({ ...l, user_id: userId })));
  }
  if (backup.auxiliary_movement_details?.length) {
    await chunkedInsert('auxiliary_movement_details', backup.auxiliary_movement_details.map(m => ({ ...m, user_id: userId })));
  }
  if (backup.kardex_definitions?.length) {
    await chunkedInsert('kardex_definitions', backup.kardex_definitions.map(d => ({ ...d, user_id: userId })));
  }
  if (backup.kardex_entries?.length) {
    await chunkedInsert('kardex_entries', backup.kardex_entries.map(e => ({ ...e, user_id: userId })));
  }
  if (backup.kardex_movements?.length) {
    await chunkedInsert('kardex_movements', backup.kardex_movements.map(m => ({ ...m, user_id: userId })));
  }
  if (backup.quarterly_closures?.length) {
    await chunkedInsert('quarterly_closures', backup.quarterly_closures.map(c => ({ ...c, user_id: userId })));
  }

  // v3.1: product_categories (parent of products.category_id — insert before products)
  if (backup.product_categories?.length) {
    await chunkedInsert('product_categories', backup.product_categories);
  }

  // v2.0 tables
  if (backup.products?.length) {
    await chunkedInsert('products', backup.products.map(p => ({ ...p, user_id: userId })));
  }
  // product_fotos: solo filas cuyo product_id vino en este mismo backup (evita
  // huérfanos); los archivos en el bucket product-photos no se restauran.
  if (backup.product_fotos?.length) {
    const validProductIds = new Set((backup.products ?? []).map((p: any) => p.id));
    const safe = backup.product_fotos
      .filter((r: any) => validProductIds.has(r.product_id))
      .map((r: any) => ({ ...r, company_id: companyId }));
    if (safe.length > 0) await chunkedInsert('product_fotos', safe);
  }
  // product_publicaciones: marcas "publicado" por vendedor. user_id se conserva
  // tal cual (válido al restaurar en la misma cuenta/empresa; una marca huérfana
  // es inofensiva). company_id se remapea a la empresa destino.
  if (backup.product_publicaciones?.length) {
    const validProductIds = new Set((backup.products ?? []).map((p: any) => p.id));
    const safe = backup.product_publicaciones
      .filter((r: any) => validProductIds.has(r.product_id))
      .map(({ id: _id, ...r }: any) => ({ ...r, company_id: companyId }));
    if (safe.length > 0) await chunkedInsert('product_publicaciones', safe);
  }
  if (backup.import_lots?.length) {
    await chunkedInsert('import_lots', backup.import_lots.map(l => ({ ...l, user_id: userId })));
  }
  // shipments antes que inventory_lots: inventory_lots.shipment_id → shipments.id (FK).
  // (también es padre de licitaciones.embarque_id, que se inserta más abajo.)
  if (backup.shipments?.length) {
    const shipmentRows = backup.shipments.map((s: any) => {
      if (s.user_id && s.data) return { ...s, user_id: userId };
      // Old localStorage format — convert
      const { id, numero, status, ...rest } = s;
      return { id, user_id: userId, numero, status, data: rest };
    });
    await chunkedInsert('shipments', shipmentRows);
  }
  if (backup.inventory_lots?.length) {
    await chunkedInsert('inventory_lots', backup.inventory_lots.map(l => ({ ...l, user_id: userId })));
  }
  if (backup.inventory_movements?.length) {
    await chunkedInsert('inventory_movements', backup.inventory_movements.map(m => ({ ...m, user_id: userId })));
  }
  if (backup.cost_sheets?.length) {
    await chunkedInsert('cost_sheets', backup.cost_sheets.map(s => ({ ...s, user_id: userId })));
  }
  if (backup.cost_sheet_cells?.length) {
    await chunkedInsert('cost_sheet_cells', backup.cost_sheet_cells.map(c => ({ ...c, user_id: userId })));
  }
  if (backup.report_settings?.length) {
    // report_settings: una fila por empresa (UNIQUE company_id).
    // Si el backup tiene varias filas (de diferentes usuarios del mismo equipo),
    // nos quedamos con la más recientemente actualizada.
    const sorted = [...backup.report_settings].sort(
      (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
    );
    const row = { ...sorted[0], user_id: userId };
    const { error: rsErr } = await supabase
      .from('report_settings')
      .upsert([row], { onConflict: 'company_id' });
    if (rsErr) throw new Error(`Error insertando en report_settings: ${rsErr.message}`);
  }

  if (backup.sales?.length) {
    await chunkedInsert('sales', backup.sales.map((s: any) => ({ ...s, user_id: userId })));
  }
  if (backup.sale_items?.length) {
    await chunkedInsert('sale_items', backup.sale_items);
  }

  // v2.1: fiscal_years
  if (backup.fiscal_years?.length) {
    await chunkedInsert('fiscal_years', backup.fiscal_years.map((fy: any) => ({
      ...fy,
      company_id: companyId,
    })));
  }

  // v2.2: customers, receivables, payables, debt_payments
  if (backup.customers?.length) {
    await chunkedInsert('customers', backup.customers.map((c: any) => ({ ...c, user_id: userId })));
  }
  if (backup.receivables?.length) {
    await chunkedInsert('receivables', backup.receivables.map((r: any) => ({ ...r, user_id: userId })));
  }
  if (backup.payables?.length) {
    await chunkedInsert('payables', backup.payables.map((p: any) => ({ ...p, user_id: userId })));
  }
  if (backup.debt_payments?.length) {
    await chunkedInsert('debt_payments', backup.debt_payments.map((d: any) => ({ ...d, user_id: userId })));
  }

  // v2.3: company_module_config
  if (backup.company_module_config?.length) {
    await chunkedInsert('company_module_config', backup.company_module_config.map((r: any) => ({
      ...r,
      company_id: companyId,
    })));
  }

  // v2.3: member_permissions — remap company_member_id by _member_user_id
  if (backup.member_permissions?.length) {
    const { data: ownerCheck } = await supabase
      .from('company_members')
      .select('id, role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (ownerCheck?.role === 'owner') {
      // Build a user_id → company_member_id map for the current company
      const { data: currentMembers } = await supabase
        .from('company_members')
        .select('id, user_id')
        .eq('company_id', companyId);
      const memberMap = new Map<string, string>(
        (currentMembers ?? []).map((m: any) => [m.user_id, m.id])
      );

      const rows = backup.member_permissions
        .map((r: any) => {
          const { id: _id, _member_user_id, ...rest } = r;
          if (_member_user_id && memberMap.has(_member_user_id)) {
            // Found the matching member in the current company
            return { ...rest, company_member_id: memberMap.get(_member_user_id) };
          }
          // _member_user_id not found in current company (e.g., restored to a different account)
          // Skip this permission rather than assigning it to the wrong member.
          return null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) await chunkedInsert('member_permissions', rows);
    }
    // Non-owners: skip silently
  }

  // v2.4: licitaciones
  if (backup.licitaciones?.length) {
    await chunkedInsert('licitaciones', backup.licitaciones.map((l: any) => ({
      ...l,
      user_id: userId,
      company_id: companyId,
    })));
  }

  if (backup.licitacion_productos?.length) {
    const validIds = new Set((backup.licitaciones ?? []).map((l: any) => l.id));
    const safe = backup.licitacion_productos.filter((r: any) => validIds.has(r.licitacion_id));
    if (safe.length > 0) await chunkedInsert('licitacion_productos', safe);
  }

  if (backup.licitacion_documentos?.length) {
    const validIds = new Set((backup.licitaciones ?? []).map((l: any) => l.id));
    const safe = backup.licitacion_documentos.filter((r: any) => validIds.has(r.licitacion_id));
    if (safe.length > 0) await chunkedInsert('licitacion_documentos', safe);
  }

  // v3.2: análisis de inversión (parent antes que items)
  if (backup.investment_analyses?.length) {
    await chunkedInsert('investment_analyses', backup.investment_analyses.map((a: any) => ({
      ...a,
      user_id: userId,
      company_id: companyId,
    })));
  }

  if (backup.investment_analysis_items?.length) {
    const validIds = new Set((backup.investment_analyses ?? []).map((a: any) => a.id));
    const safe = backup.investment_analysis_items.filter((r: any) => validIds.has(r.analysis_id));
    if (safe.length > 0) await chunkedInsert('investment_analysis_items', safe);
  }

  // v3.3: configuración de cuentas de venta (UNIQUE company_id + tipo_pago → upsert)
  if (backup.company_sale_account_config?.length) {
    const { error } = await supabase
      .from('company_sale_account_config')
      .upsert(
        backup.company_sale_account_config.map((r: any) => ({ ...r, company_id: companyId })),
        { onConflict: 'company_id,tipo_pago' }
      );
    if (error) throw new Error(`Error insertando en company_sale_account_config: ${error.message}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function restoreFromBackup(backup: BackupData, activeCompanyId?: string): Promise<{ success: boolean; message: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const companyId = await resolveCompanyId(user.id, activeCompanyId);

  // ── Pre-restore snapshot ────────────────────────────────────────────────────
  // Because PostgREST does not expose multi-statement transactions, we mitigate
  // partial-failure risk by taking a snapshot of the current data before any
  // deletions. If the restore fails midway we automatically attempt to restore
  // from the snapshot, effectively rolling back to the pre-restore state.
  let preRestoreSnapshot: BackupData | null = null;
  try {
    preRestoreSnapshot = await createFullBackup(companyId);
  } catch (snapshotErr) {
    // Non-fatal: proceed without rollback capability. The user should be warned.
    console.warn('[backup] Could not create pre-restore snapshot — rollback disabled:', snapshotErr);
  }

  try {
    await _performRestoreInternal(backup, user.id, companyId);

    const extras: string[] = [];
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
    if (backup.licitaciones?.length) extras.push(`${backup.licitaciones.length} licitaciones`);

    return {
      success: true,
      message: `Restauración completada: ${backup.accounts.length} cuentas, ${backup.journal_entries.length} asientos${extras.length ? ', ' + extras.join(', ') : ''}`,
    };
  } catch (restoreError: any) {
    // ── Automatic rollback ────────────────────────────────────────────────────
    if (preRestoreSnapshot) {
      console.warn('[backup] Restore failed — attempting automatic rollback to pre-restore snapshot...');
      try {
        await _performRestoreInternal(preRestoreSnapshot, user.id, companyId);
        return {
          success: false,
          message: `Error en restauración: ${restoreError.message}. Los datos originales fueron recuperados automáticamente.`,
        };
      } catch (rollbackError: any) {
        console.error('[backup] Rollback also failed:', rollbackError);
        return {
          success: false,
          message: `Error crítico en restauración: ${restoreError.message}. La recuperación automática también falló (${rollbackError.message}). Por favor restaure manualmente desde otro backup.`,
        };
      }
    }

    return {
      success: false,
      message: `Error en restauración: ${restoreError.message}`,
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
    'licitaciones', 'licitacion_productos', 'licitacion_documentos',
    'product_categories',
    'investment_analyses', 'investment_analysis_items',
    'company_sale_account_config',
    'product_fotos',
    'product_publicaciones',
  ];

  for (const key of optionalArrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { valid: false, error: `Campo inválido (debe ser array): ${key}` };
    }
  }

  return { valid: true };
}
