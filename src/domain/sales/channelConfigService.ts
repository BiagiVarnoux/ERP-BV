// Gestión de canales de venta por empresa.
// Cada canal es una fila en la DB que vincula un canal con sus cuentas de
// Ingreso, Costo de Ventas y su método CxC. La primera vez que una empresa
// abre la pantalla se precargan los 4 canales típicos como punto de partida
// (editables, renombrables y eliminables).

import { supabase } from '@/integrations/supabase/client';
import type { Canal } from './types';

export interface SaleChannel {
  canal_key: string;        // se guarda en sales.canal
  label: string;            // nombre visible en el selector
  revenue_account: string;  // cuenta de Ingreso (Haber)
  cogs_account: string;     // cuenta de Costo de Ventas (Debe)
  cxc_tipo_pago: string | null; // método CxC que usa este canal (tipo_pago)
  enabled: boolean;
  sort_order: number;
}

// Semilla por defecto: réplica exacta del mapeo hardcodeado histórico.
const DEFAULT_CHANNELS: Omit<SaleChannel, 'sort_order'>[] = [
  { canal_key: 'licitacion',  label: 'Licitación',  revenue_account: 'I.1.1', cogs_account: 'G.4.1', cxc_tipo_pago: 'cxc_licitaciones', enabled: true },
  { canal_key: 'electronica', label: 'Electrónica', revenue_account: 'I.1.2', cogs_account: 'G.4.2', cxc_tipo_pago: 'cxc_electronica', enabled: true },
  { canal_key: 'pedido',      label: 'Pedido',      revenue_account: 'I.1.3', cogs_account: 'G.4.3', cxc_tipo_pago: 'cxc_pedido',       enabled: true },
  { canal_key: 'general',     label: 'General',     revenue_account: 'I.1',   cogs_account: 'G.4',   cxc_tipo_pago: 'cxc',             enabled: true },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

async function seedDefaultChannels(companyId: string): Promise<void> {
  const rows = DEFAULT_CHANNELS.map((c, i) => ({
    company_id: companyId,
    canal_key: c.canal_key,
    label: c.label,
    revenue_account: c.revenue_account,
    cogs_account: c.cogs_account,
    cxc_tipo_pago: c.cxc_tipo_pago,
    enabled: c.enabled,
    sort_order: i,
  }));
  await supabase.from('company_sale_channel_config').insert(rows);
}

function rowToChannel(r: {
  canal_key: string; label: string | null; revenue_account: string; cogs_account: string;
  cxc_tipo_pago: string | null; enabled: boolean | null; sort_order: number | null;
}): SaleChannel {
  return {
    canal_key: r.canal_key,
    label: r.label ?? r.canal_key,
    revenue_account: r.revenue_account,
    cogs_account: r.cogs_account,
    cxc_tipo_pago: r.cxc_tipo_pago,
    enabled: r.enabled ?? true,
    sort_order: r.sort_order ?? 0,
  };
}

export async function loadChannels(companyId: string): Promise<SaleChannel[]> {
  const { data, error } = await supabase
    .from('company_sale_channel_config')
    .select('canal_key, label, revenue_account, cogs_account, cxc_tipo_pago, enabled, sort_order')
    .eq('company_id', companyId)
    .order('sort_order');
  if (error) throw error;

  if (!data || data.length === 0) {
    await seedDefaultChannels(companyId);
    const { data: seeded } = await supabase
      .from('company_sale_channel_config')
      .select('canal_key, label, revenue_account, cogs_account, cxc_tipo_pago, enabled, sort_order')
      .eq('company_id', companyId)
      .order('sort_order');
    return (seeded ?? []).map(rowToChannel);
  }

  return data.map(rowToChannel);
}

export async function saveChannels(companyId: string, channels: SaleChannel[]): Promise<void> {
  if (!channels.length) return;
  const { error } = await supabase
    .from('company_sale_channel_config')
    .upsert(
      channels.map((c, i) => ({
        company_id: companyId,
        canal_key: c.canal_key,
        label: c.label,
        revenue_account: c.revenue_account,
        cogs_account: c.cogs_account,
        cxc_tipo_pago: c.cxc_tipo_pago,
        enabled: c.enabled,
        sort_order: c.sort_order ?? i,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'company_id,canal_key' },
    );
  if (error) throw error;
}

export async function deleteChannel(companyId: string, canal_key: string): Promise<void> {
  const { error } = await supabase
    .from('company_sale_channel_config')
    .delete()
    .eq('company_id', companyId)
    .eq('canal_key', canal_key);
  if (error) throw error;
}

export function generateChannelKey(label: string, existingKeys: string[]): string {
  const base = slugify(label) || 'canal';
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i}`;
    i++;
  }
  return key;
}

/** Mapa canal_key → {revenue_account, cogs_account} para pasar a resolveAccounts/createSale. */
export function channelsToAccountMap(
  channels: SaleChannel[],
): Record<string, { revenue_account: string; cogs_account: string }> {
  return Object.fromEntries(
    channels.map(c => [c.canal_key, { revenue_account: c.revenue_account, cogs_account: c.cogs_account }]),
  );
}

/** Fallback de labels para los 4 canales de sistema (sales list, dashboard). */
export const SYSTEM_CANAL_LABELS: Record<Canal, string> = {
  licitacion: 'Licitación',
  electronica: 'Electrónica',
  pedido: 'Pedido',
  general: 'General',
};
