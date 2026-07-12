import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import { logAuditEntry } from '@/services/auditService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { Moneda } from '@/domain/receivables';
export type PayableEstado = 'open' | 'partial' | 'paid' | 'voided';
export type { Moneda as PayableMoneda } from '@/domain/receivables';

import type { Moneda } from '@/domain/receivables';

export interface PayableRow {
  id: string;
  company_id: string;
  user_id: string;
  proveedor_nombre: string;
  proveedor_nit: string | null;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_original: number;
  monto_pendiente: number;
  moneda: Moneda;
  estado: PayableEstado;
  notas: string | null;
  journal_entry_id: string | null;
  cuenta_gasto_id: string | null;
  cuenta_pasivo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePayableInput {
  proveedor_nombre: string;
  proveedor_nit?: string | null;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  monto_original: number;
  moneda: Moneda;
  notas?: string | null;
  cuenta_gasto_id: string;
  cuenta_pasivo_id: string;
}

export interface RegisterPayablePaymentInput {
  payable_id: string;
  fecha: string;
  monto: number;
  tipo_pago: string;
  cuenta_pago_id: string;
  notas?: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listPayables(): Promise<PayableRow[]> {
  const companyId = await resolveUserCompanyId();
  const { data, error } = await (supabase
    .from('payables' as any)
    .select('*')
    .eq('company_id', companyId)
    .order('fecha_emision', { ascending: false }) as any);

  if (error) throw new Error(error.message);
  return (data ?? []) as PayableRow[];
}

export async function createPayable(input: CreatePayableInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { data, error } = await (supabase.rpc('create_payable_with_journal' as any, {
    payload: {
      company_id:        companyId,
      proveedor_nombre:  input.proveedor_nombre,
      proveedor_nit:     input.proveedor_nit ?? null,
      numero_documento:  input.numero_documento,
      fecha_emision:     input.fecha_emision,
      fecha_vencimiento: input.fecha_vencimiento ?? null,
      monto_original:    input.monto_original,
      moneda:            input.moneda,
      notas:             input.notas ?? null,
      cuenta_gasto_id:   input.cuenta_gasto_id,
      cuenta_pasivo_id:  input.cuenta_pasivo_id,
    },
  }) as any);

  if (error) throw new Error(error.message);

  // Audit trail
  await logAuditEntry('payables', input.numero_documento, 'INSERT', null, {
    proveedor_nombre: input.proveedor_nombre,
    numero_documento: input.numero_documento,
    monto_original: input.monto_original,
    moneda: input.moneda,
    fecha_emision: input.fecha_emision,
    journal_entry_id: (data as { entry_id?: string } | null)?.entry_id ?? null,
  });
}

export async function registerPayablePayment(input: RegisterPayablePaymentInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { data, error } = await (supabase.rpc('register_payable_payment_with_journal' as any, {
    payload: {
      company_id:     companyId,
      payable_id:     input.payable_id,
      fecha:          input.fecha,
      monto:          input.monto,
      tipo_pago:      input.tipo_pago,
      cuenta_pago_id: input.cuenta_pago_id,
      notas:          input.notas ?? null,
    },
  }) as any);
  if (error) throw new Error(error.message);

  const result = data as { monto_pendiente?: number; estado?: PayableEstado; entry_id?: string } | null;

  // Audit trail
  await logAuditEntry('payables', input.payable_id, 'UPDATE',
    { estado: 'open' },
    { monto_pendiente: result?.monto_pendiente ?? null, estado: result?.estado ?? null, pago_monto: input.monto, journal_entry_id: result?.entry_id ?? null }
  );
}

export async function voidPayable(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { error } = await (supabase
    .from('payables' as any)
    .update({ estado: 'voided', updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .eq('company_id', companyId) as any);
  if (error) throw new Error(error.message);

  // Audit trail
  await logAuditEntry('payables', id, 'UPDATE',
    { estado: 'open' }, { estado: 'voided' }
  );
}
