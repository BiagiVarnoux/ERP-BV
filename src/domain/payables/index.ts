import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_COMPANY_ID } from '@/lib/constants';
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
}

export interface RegisterPayablePaymentInput {
  payable_id: string;
  fecha: string;
  monto: number;
  tipo_pago: string;
  notas?: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listPayables(): Promise<PayableRow[]> {
  const { data, error } = await (supabase
    .from('payables' as any)
    .select('*')
    .eq('company_id', DEFAULT_COMPANY_ID)
    .order('fecha_emision', { ascending: false }) as any);

  if (error) throw new Error(error.message);
  return (data ?? []) as PayableRow[];
}

export async function createPayable(input: CreatePayableInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await (supabase.from('payables' as any).insert({
    company_id:       DEFAULT_COMPANY_ID,
    user_id:          user.id,
    proveedor_nombre: input.proveedor_nombre,
    proveedor_nit:    input.proveedor_nit ?? null,
    numero_documento: input.numero_documento,
    fecha_emision:    input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento ?? null,
    monto_original:   input.monto_original,
    monto_pendiente:  input.monto_original,
    moneda:           input.moneda,
    estado:           'open',
    notas:            input.notas ?? null,
  } as any) as any);

  if (error) throw new Error(error.message);
}

export async function registerPayablePayment(input: RegisterPayablePaymentInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  // 1. Fetch current payable
  const { data: rec, error: fetchErr } = await (supabase
    .from('payables' as any)
    .select('monto_pendiente')
    .eq('id', input.payable_id)
    .single() as any);
  if (fetchErr || !rec) throw new Error(fetchErr?.message ?? 'Documento no encontrado');

  const currentPendiente = (rec as { monto_pendiente: number }).monto_pendiente;

  // 2. Insert payment record
  const { error: payErr } = await (supabase.from('debt_payments' as any).insert({
    company_id:    DEFAULT_COMPANY_ID,
    user_id:       user.id,
    receivable_id: null,
    payable_id:    input.payable_id,
    fecha:         input.fecha,
    monto:         input.monto,
    tipo_pago:     input.tipo_pago,
    notas:         input.notas ?? null,
  } as any) as any);
  if (payErr) throw new Error(payErr.message);

  // 3. Recalculate pending balance and new estado
  const newPendiente = round2(currentPendiente - input.monto);
  const newEstado: PayableEstado = newPendiente <= 0 ? 'paid' : 'partial';

  // 4. Update payable
  const { error: updErr } = await (supabase
    .from('payables' as any)
    .update({
      monto_pendiente: Math.max(0, newPendiente),
      estado:          newEstado,
      updated_at:      new Date().toISOString(),
    } as any)
    .eq('id', input.payable_id) as any);
  if (updErr) throw new Error(updErr.message);
}

export async function voidPayable(id: string): Promise<void> {
  const { error } = await (supabase
    .from('payables' as any)
    .update({ estado: 'voided', updated_at: new Date().toISOString() } as any)
    .eq('id', id) as any);
  if (error) throw new Error(error.message);
}
