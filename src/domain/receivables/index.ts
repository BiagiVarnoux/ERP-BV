import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import { round2 } from '@/accounting/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceivableEstado = 'open' | 'partial' | 'paid' | 'voided';
export type Moneda = 'BOB' | 'USD' | 'USDT';

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
  created_at: string;
  updated_at: string;
  // joined
  customer_razon_social?: string | null;
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
}

export interface RegisterPaymentInput {
  receivable_id: string;
  fecha: string;
  monto: number;
  tipo_pago: string;
  notas?: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listReceivables(): Promise<ReceivableRow[]> {
  const companyId = await resolveUserCompanyId();
  const { data, error } = await supabase
    .from('receivables')
    .select(`
      *,
      customers ( razon_social )
    `)
    .eq('company_id', companyId)
    .order('fecha_emision', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const customers = r.customers as { razon_social?: string | null } | null;
    return {
      ...(r as ReceivableRow),
      customer_razon_social: customers?.razon_social ?? null,
    };
  });
}

export async function createReceivable(input: CreateReceivableInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const companyId = await resolveUserCompanyId();

  const { error } = await supabase.from('receivables').insert({
    company_id:       companyId,
    user_id:          user.id,
    customer_id:      input.customer_id ?? null,
    sale_id:          input.sale_id ?? null,
    numero_documento: input.numero_documento,
    fecha_emision:    input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento ?? null,
    monto_original:   input.monto_original,
    monto_pendiente:  input.monto_original,
    moneda:           input.moneda,
    estado:           'open',
    notas:            input.notas ?? null,
  });

  if (error) throw new Error(error.message);
}

export async function registerPayment(input: RegisterPaymentInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  // 1. Fetch current receivable
  const { data: rec, error: fetchErr } = await supabase
    .from('receivables')
    .select('monto_pendiente')
    .eq('id', input.receivable_id)
    .single();
  if (fetchErr || !rec) throw new Error(fetchErr?.message ?? 'Documento no encontrado');

  const currentPendiente = (rec as unknown as { monto_pendiente: number }).monto_pendiente;

  // 2. Insert payment record
  const companyId = await resolveUserCompanyId();
  const { error: payErr } = await supabase.from('debt_payments').insert({
    company_id:    companyId,
    user_id:       user.id,
    receivable_id: input.receivable_id,
    payable_id:    null,
    fecha:         input.fecha,
    monto:         input.monto,
    tipo_pago:     input.tipo_pago,
    notas:         input.notas ?? null,
  });
  if (payErr) throw new Error(payErr.message);

  // 3. Recalculate pending balance and new estado
  const newPendiente = round2(currentPendiente - input.monto);
  const newEstado: ReceivableEstado = newPendiente <= 0 ? 'paid' : 'partial';

  // 4. Update receivable
  const { error: updErr } = await supabase
    .from('receivables')
    .update({
      monto_pendiente: Math.max(0, newPendiente),
      estado:          newEstado,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', input.receivable_id);
  if (updErr) throw new Error(updErr.message);
}

export async function voidReceivable(id: string): Promise<void> {
  const { error } = await supabase
    .from('receivables')
    .update({ estado: 'voided', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
