// Servicio para cargar y guardar la configuración de cuentas contables por tipo de pago.
// Los defaults están en resolveAccounts.ts (DEFAULT_PAYMENT_ACCOUNTS).
// Si una empresa no tiene filas en company_sale_account_config, se usan los defaults.

import { supabase } from '@/integrations/supabase/client';
import type { TipoPago } from './types';

export type SaleAccountConfig = Partial<Record<TipoPago, string>>;

export async function loadSaleAccountConfig(companyId: string): Promise<SaleAccountConfig> {
  const { data, error } = await supabase
    .from('company_sale_account_config')
    .select('tipo_pago, account_codigo')
    .eq('company_id', companyId);
  if (error) throw error;
  const config: SaleAccountConfig = {};
  for (const row of data ?? []) {
    config[row.tipo_pago as TipoPago] = row.account_codigo;
  }
  return config;
}

export async function saveSaleAccountConfig(
  companyId: string,
  config: SaleAccountConfig,
): Promise<void> {
  const rows = Object.entries(config)
    .filter(([, code]) => code)
    .map(([tipo_pago, account_codigo]) => ({
      company_id: companyId,
      tipo_pago,
      account_codigo: account_codigo!,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('company_sale_account_config')
    .upsert(rows, { onConflict: 'company_id,tipo_pago' });
  if (error) throw error;
}
