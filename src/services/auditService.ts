// src/services/auditService.ts
import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_fields: string[] | null;
  created_at: string;
}

function getChangedFields(oldValues: Record<string, any> | null, newValues: Record<string, any> | null): string[] {
  if (!oldValues || !newValues) return [];
  
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  
  for (const key of allKeys) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changed.push(key);
    }
  }
  
  return changed;
}

export async function logAuditEntry(
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  oldValues: Record<string, any> | null = null,
  newValues: Record<string, any> | null = null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  
  const changedFields = getChangedFields(oldValues, newValues);
  const companyId = await resolveUserCompanyId();

  await supabase.from('audit_log').insert({
    user_id: user.id,
    company_id: companyId,
    table_name: tableName,
    record_id: recordId,
    action,
    old_values: oldValues,
    new_values: newValues,
    changed_fields: changedFields.length > 0 ? changedFields : null,
  });
}

export async function getAuditLog(
  tableName?: string,
  recordId?: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (tableName) {
    query = query.eq('table_name', tableName);
  }
  
  if (recordId) {
    query = query.eq('record_id', recordId);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  
  return (data || []) as AuditLogEntry[];
}

export function formatAuditAction(action: string): string {
  switch (action) {
    case 'INSERT': return 'Creación';
    case 'UPDATE': return 'Modificación';
    case 'DELETE': return 'Eliminación';
    default: return action;
  }
}

export function formatTableName(tableName: string): string {
  switch (tableName) {
    case 'journal_entries': return 'Asientos';
    case 'journal_lines': return 'Líneas de asiento';
    case 'accounts': return 'Cuentas';
    case 'auxiliary_ledger': return 'Libro auxiliar';
    case 'kardex_movements': return 'Movimientos Kardex';
    default: return tableName;
  }
}
