import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import { logAuditEntry } from '@/services/auditService';
import { round2 } from '@/accounting/utils';

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

export interface EditPayableAmountInput {
  id: string;
  monto_original: number;
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

// Corrige el monto original de una CxP a mano (p. ej. tras arreglar el asiento
// directamente en el Libro Diario). No toca journal_entries/journal_lines —
// solo mantiene lo ya pagado y ajusta el pendiente.
export async function editPayableAmount(input: EditPayableAmountInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  if (!(input.monto_original > 0)) {
    throw new Error('El monto debe ser mayor a 0');
  }

  const { data: current, error: fetchError } = await (supabase
    .from('payables' as any)
    .select('monto_original, monto_pendiente, estado')
    .eq('id', input.id)
    .eq('company_id', companyId)
    .single() as any);
  if (fetchError) throw new Error(fetchError.message);

  const row = current as { monto_original: number; monto_pendiente: number; estado: PayableEstado };
  if (row.estado !== 'open' && row.estado !== 'partial') {
    throw new Error('Solo se puede editar el monto de una CxP abierta o parcial');
  }

  const pagado = round2(row.monto_original - row.monto_pendiente);
  const nuevoPendiente = round2(input.monto_original - pagado);
  if (nuevoPendiente < 0) {
    throw new Error(`El monto no puede ser menor a lo ya pagado (${pagado})`);
  }

  const { error } = await (supabase
    .from('payables' as any)
    .update({
      monto_original: round2(input.monto_original),
      monto_pendiente: nuevoPendiente,
      estado: nuevoPendiente === 0 ? 'paid' : row.estado,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', input.id)
    .eq('company_id', companyId) as any);
  if (error) throw new Error(error.message);

  // Audit trail
  await logAuditEntry('payables', input.id, 'UPDATE',
    { monto_original: row.monto_original, monto_pendiente: row.monto_pendiente },
    { monto_original: round2(input.monto_original), monto_pendiente: nuevoPendiente }
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
