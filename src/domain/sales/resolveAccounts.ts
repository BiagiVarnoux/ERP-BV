import type { Canal, TipoPago, ResolvedAccounts } from './types';

export const DEFAULT_PAYMENT_ACCOUNTS: Record<TipoPago, string> = {
  caja_mn: 'A.2',
  banco_mn: 'A.1',
  banco_me: 'A.3',
  facebank: 'A.8',
  facebank2: 'A.8.2',
  facebank3: 'A.8.3',
  usdt: 'A.7',
  usdt2: 'A.7.1',
  cxc: 'A.5',
  cxc_electronica: 'A.5.2',
  cxc_pedido: 'A.5.3',
  cxc_licitaciones: 'A.5.1',
};

// Alias privado para no romper la firma de resolveAccounts
const PAYMENT_ACCOUNTS = DEFAULT_PAYMENT_ACCOUNTS;

const REVENUE_ACCOUNTS: Record<Canal, string> = {
  licitacion: 'I.1.1',
  electronica: 'I.1.2',
  pedido: 'I.1.3',
  general: 'I.1',
};

const COGS_ACCOUNTS: Record<Canal, string> = {
  licitacion: 'G.4.1',
  electronica: 'G.4.2',
  pedido: 'G.4.3',
  general: 'G.4',
};

export const TIPO_PAGO_LABELS: Record<TipoPago, string> = {
  caja_mn: 'Caja MN',
  banco_mn: 'Banco MN',
  banco_me: 'Banco ME',
  facebank: 'Facebank',
  facebank2: 'Facebank 2',
  facebank3: 'Facebank 3',
  usdt: 'USDT',
  usdt2: 'USDT 2',
  cxc: 'CxC General',
  cxc_electronica: 'CxC Electrónica',
  cxc_pedido: 'CxC Pedido',
  cxc_licitaciones: 'CxC Licitaciones',
};

export const CANAL_LABELS: Record<Canal, string> = {
  licitacion: 'Licitación',
  electronica: 'Electrónica',
  pedido: 'Pedido',
  general: 'General',
};

export function resolveAccounts(
  canal: Canal,
  tipoPago: TipoPago,
  paymentConfig?: Partial<Record<TipoPago, string>>,
): ResolvedAccounts {
  return {
    payment_account: paymentConfig?.[tipoPago] ?? PAYMENT_ACCOUNTS[tipoPago],
    revenue_account: REVENUE_ACCOUNTS[canal],
    cogs_account: COGS_ACCOUNTS[canal],
  };
}
