// Servicio para gestionar métodos de pago por empresa.
// Los 12 métodos del sistema son defaults; cada empresa puede:
//   - Cambiar la cuenta asignada a un método del sistema
//   - Activar/desactivar métodos del sistema
//   - Agregar métodos personalizados
//   - Eliminar métodos personalizados

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PAYMENT_ACCOUNTS, TIPO_PAGO_LABELS } from './resolveAccounts';
import type { TipoPago } from './types';

export interface PaymentMethod {
  tipo_pago: string;      // key almacenado en sales.tipo_pago
  label: string;          // nombre visible en el selector
  account_codigo: string; // código de cuenta del plan de cuentas
  enabled: boolean;       // si aparece en el modal de ventas
  is_custom: boolean;     // true = creado por el usuario, puede eliminarse
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

export async function loadPaymentMethods(companyId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('company_sale_account_config')
    .select('tipo_pago, account_codigo, label, enabled, is_custom')
    .eq('company_id', companyId);
  if (error) throw error;

  const dbMap = new Map((data ?? []).map(r => [r.tipo_pago, r]));
  const result: PaymentMethod[] = [];

  // Métodos del sistema (orden fijo)
  for (const [tipo_pago, defaultCodigo] of Object.entries(DEFAULT_PAYMENT_ACCOUNTS)) {
    const row = dbMap.get(tipo_pago);
    result.push({
      tipo_pago,
      label: TIPO_PAGO_LABELS[tipo_pago as TipoPago],
      account_codigo: row?.account_codigo ?? defaultCodigo,
      enabled: row?.enabled ?? true,
      is_custom: false,
    });
    dbMap.delete(tipo_pago);
  }

  // Métodos personalizados (los que quedan en el mapa)
  for (const [tipo_pago, row] of dbMap) {
    if (row.is_custom) {
      result.push({
        tipo_pago,
        label: row.label ?? tipo_pago,
        account_codigo: row.account_codigo,
        enabled: row.enabled ?? true,
        is_custom: true,
      });
    }
  }

  return result;
}

export async function savePaymentMethods(
  companyId: string,
  methods: PaymentMethod[],
): Promise<void> {
  // Solo persistimos filas que difieren de los defaults del sistema, o que son custom
  const rows = methods
    .filter(m => {
      if (m.is_custom) return true;
      const defaultCodigo = DEFAULT_PAYMENT_ACCOUNTS[m.tipo_pago as TipoPago];
      return m.account_codigo !== defaultCodigo || !m.enabled;
    })
    .map(m => ({
      company_id: companyId,
      tipo_pago:  m.tipo_pago,
      account_codigo: m.account_codigo,
      label:      m.is_custom ? m.label : null,
      enabled:    m.enabled,
      is_custom:  m.is_custom,
      updated_at: new Date().toISOString(),
    }));

  // Upsert las filas modificadas
  if (rows.length) {
    const { error } = await supabase
      .from('company_sale_account_config')
      .upsert(rows, { onConflict: 'company_id,tipo_pago' });
    if (error) throw error;
  }

  // Eliminar filas de métodos del sistema que volvieron a sus defaults
  // (enabled=true, account_codigo=default) — limpieza opcional
  const resetTipos = methods
    .filter(m => !m.is_custom)
    .filter(m => {
      const defaultCodigo = DEFAULT_PAYMENT_ACCOUNTS[m.tipo_pago as TipoPago];
      return m.account_codigo === defaultCodigo && m.enabled;
    })
    .map(m => m.tipo_pago);

  if (resetTipos.length) {
    await supabase
      .from('company_sale_account_config')
      .delete()
      .eq('company_id', companyId)
      .in('tipo_pago', resetTipos)
      .eq('is_custom', false);
  }
}

export async function deleteCustomPaymentMethod(
  companyId: string,
  tipo_pago: string,
): Promise<void> {
  const { error } = await supabase
    .from('company_sale_account_config')
    .delete()
    .eq('company_id', companyId)
    .eq('tipo_pago', tipo_pago)
    .eq('is_custom', true);
  if (error) throw error;
}

export function generateTipoPagoKey(label: string, existingKeys: string[]): string {
  const base = `custom_${slugify(label) || 'metodo'}`;
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i}`;
    i++;
  }
  return key;
}

// Compatibilidad con el sistema anterior (solo account_codigo por tipo_pago)
export async function loadSaleAccountConfig(companyId: string): Promise<SaleAccountConfig> {
  const methods = await loadPaymentMethods(companyId);
  const config: SaleAccountConfig = {};
  for (const m of methods) {
    config[m.tipo_pago] = m.account_codigo;
  }
  return config;
}
