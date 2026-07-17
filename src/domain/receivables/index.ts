import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import { logAuditEntry } from '@/services/auditService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceivableEstado = 'open' | 'partial' | 'paid' | 'voided';
export type Moneda = 'BOB' | 'USD' | 'USDT';
export type CanalFilter = 'all' | 'licitacion' | 'electronica' | 'pedido' | 'general' | 'sin_canal';

export interface ReceivableRow {
  id: string;
  company_id: string;
  user_id: string;
  customer_id: string | null;
  sale_id: string | null;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_original: number;
  monto_pendiente: number;
  moneda: Moneda;
  estado: ReceivableEstado;
  notas: string | null;
  journal_entry_id: string | null;
  cuenta_activo_id: string | null;
  cuenta_ingreso_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer_razon_social?: string | null;
  sale_canal?: string | null;
}

export interface CreateReceivableInput {
  customer_id?: string | null;
  sale_id?: string | null;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  monto_original: number;
  moneda: Moneda;
  notas?: string | null;
  cuenta_activo_id: string;
  cuenta_ingreso_id: string;
}

export interface RegisterPaymentInput {
  receivable_id: string;
  fecha: string;
  monto: number;
  tipo_pago: string;
  cuenta_pago_id: string;
  notas?: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listReceivables(): Promise<ReceivableRow[]> {
  const companyId = await resolveUserCompanyId();
  const { data, error } = await supabase
    .from('receivables')
    .select(`
      *,
      customers ( razon_social ),
      sales ( canal )
    `)
    .eq('company_id', companyId)
    .order('fecha_emision', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const customers = r.customers as { razon_social?: string | null } | null;
    const sales = r.sales as { canal?: string | null } | null;
    return {
      ...(r as ReceivableRow),
      customer_razon_social: customers?.razon_social ?? null,
      sale_canal: sales?.canal ?? null,
    };
  });
}

export async function createReceivable(input: CreateReceivableInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { data, error } = await (supabase.rpc('create_receivable_with_journal' as any, {
    payload: {
      company_id:        companyId,
      customer_id:       input.customer_id ?? null,
      numero_documento:  input.numero_documento,
      fecha_emision:     input.fecha_emision,
      fecha_vencimiento: input.fecha_vencimiento ?? null,
      monto_original:    input.monto_original,
      moneda:            input.moneda,
      notas:             input.notas ?? null,
      cuenta_activo_id:  input.cuenta_activo_id,
      cuenta_ingreso_id: input.cuenta_ingreso_id,
    },
  }) as any);

  if (error) throw new Error(error.message);

  // Audit trail
  await logAuditEntry('receivables', input.numero_documento, 'INSERT', null, {
    numero_documento: input.numero_documento,
    monto_original: input.monto_original,
    moneda: input.moneda,
    fecha_emision: input.fecha_emision,
    journal_entry_id: (data as { entry_id?: string } | null)?.entry_id ?? null,
  });
}

export async function registerPayment(input: RegisterPaymentInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { data, error } = await (supabase.rpc('register_receivable_payment_with_journal' as any, {
    payload: {
      company_id:     companyId,
      receivable_id:  input.receivable_id,
      fecha:          input.fecha,
      monto:          input.monto,
      tipo_pago:      input.tipo_pago,
      cuenta_pago_id: input.cuenta_pago_id,
      notas:          input.notas ?? null,
    },
  }) as any);
  if (error) throw new Error(error.message);

  const result = data as { monto_pendiente?: number; estado?: ReceivableEstado; entry_id?: string } | null;

  // Audit trail
  await logAuditEntry('receivables', input.receivable_id, 'UPDATE',
    { estado: 'open' },
    { monto_pendiente: result?.monto_pendiente ?? null, estado: result?.estado ?? null, pago_monto: input.monto, journal_entry_id: result?.entry_id ?? null }
  );
}

export async function voidReceivable(id: string): Promise<void> {
  const { error } = await supabase
    .from('receivables')
    .update({ estado: 'voided', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);

  await logAuditEntry('receivables', id, 'UPDATE',
    { estado: 'open' }, { estado: 'voided' }
  );
}
