// Gestión de métodos de pago por empresa.
// Todos los métodos son filas en la DB — sin distinción sistema vs personalizado.
// La primera vez que una empresa carga esta pantalla, se precarga con los
// 12 métodos típicos como punto de partida (editables y eliminables).

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PAYMENT_ACCOUNTS, TIPO_PAGO_LABELS } from './resolveAccounts';
import type { TipoPago } from './types';

export interface PaymentMethod {
  tipo_pago: string;      // key almacenado en sales.tipo_pago
  label: string;          // nombre visible en el selector
  account_codigo: string; // código de cuenta del plan de cuentas
  enabled: boolean;       // si aparece en el modal de ventas
}

export type SaleAccountConfig = Partial<Record<string, string>>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

async function seedDefaultMethods(companyId: string): Promise<void> {
  const rows = Object.entries(DEFAULT_PAYMENT_ACCOUNTS).map(([tipo_pago, account_codigo]) => ({
    company_id: companyId,
    tipo_pago,
    account_codigo,
    label: TIPO_PAGO_LABELS[tipo_pago as TipoPago],
    enabled: true,
  }));
  await supabase.from('company_sale_account_config').insert(rows);
}

export async function loadPaymentMethods(companyId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('company_sale_account_config')
    .select('tipo_pago, account_codigo, label, enabled')
    .eq('company_id', companyId)
    .order('created_at');
  if (error) throw error;

  // Primera vez: sembrar los 12 métodos típicos y recargar
  if (!data || data.length === 0) {
    await seedDefaultMethods(companyId);
    const { data: seeded } = await supabase
      .from('company_sale_account_config')
      .select('tipo_pago, account_codigo, label, enabled')
      .eq('company_id', companyId)
      .order('created_at');
    return (seeded ?? []).map(rowToMethod);
  }

  return data.map(rowToMethod);
}

function rowToMethod(r: { tipo_pago: string; account_codigo: string; label: string | null; enabled: boolean }): PaymentMethod {
  return {
    tipo_pago:     r.tipo_pago,
    label:         r.label ?? TIPO_PAGO_LABELS[r.tipo_pago as TipoPago] ?? r.tipo_pago,
    account_codigo: r.account_codigo,
    enabled:       r.enabled ?? true,
  };
}

export async function savePaymentMethods(
  companyId: string,
  methods: PaymentMethod[],
): Promise<void> {
  if (!methods.length) return;
  const { error } = await supabase
    .from('company_sale_account_config')
    .upsert(
      methods.map(m => ({
        company_id:    companyId,
        tipo_pago:     m.tipo_pago,
        account_codigo: m.account_codigo,
        label:         m.label,
        enabled:       m.enabled,
        updated_at:    new Date().toISOString(),
      })),
      { onConflict: 'company_id,tipo_pago' },
    );
  if (error) throw error;
}

export async function deletePaymentMethod(
  companyId: string,
  tipo_pago: string,
): Promise<void> {
  const { error } = await supabase
    .from('company_sale_account_config')
    .delete()
    .eq('company_id', companyId)
    .eq('tipo_pago', tipo_pago);
  if (error) throw error;
}

export function generateTipoPagoKey(label: string, existingKeys: string[]): string {
  const base = slugify(label) || 'metodo';
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i}`;
    i++;
  }
  return key;
}

// Compatibilidad con createSale (pasa el mapa account_codigo por tipo_pago)
export async function loadSaleAccountConfig(companyId: string): Promise<SaleAccountConfig> {
  const methods = await loadPaymentMethods(companyId);
  return Object.fromEntries(methods.map(m => [m.tipo_pago, m.account_codigo]));
}
