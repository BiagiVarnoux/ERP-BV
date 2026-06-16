// Valores de condición de producto y tipo de inventario compartidos en todo el sistema

export const CONDICION_OPTIONS = [
  { value: 'nuevo',                       label: 'Nuevo',                        code: 'NVO' },
  { value: 'reacondicionado_certificado', label: 'Reacondicionado - Certificado', code: 'RCT' },
  { value: 'reacondicionado_excelente',   label: 'Reacondicionado - Excelente',   code: 'REX' },
  { value: 'reacondicionado_very_good',   label: 'Reacondicionado - Very Good',   code: 'RVG' },
  { value: 'reacondicionado_good',        label: 'Reacondicionado - Good',        code: 'RGD' },
  { value: 'reacondicionado_fair',        label: 'Reacondicionado - Fair',        code: 'RFR' },
  { value: 'usado',                       label: 'Usado',                         code: 'USD' },
] as const;

export type CondicionValue = typeof CONDICION_OPTIONS[number]['value'];

export function condicionLabel(value: string | null | undefined): string {
  return CONDICION_OPTIONS.find(o => o.value === value)?.label ?? value ?? '—';
}

export function condicionCode(value: string | null | undefined): string {
  return CONDICION_OPTIONS.find(o => o.value === value)?.code ?? 'NVO';
}

// ─── Tipo de inventario ───────────────────────────────────────────────────────

export const TIPO_INVENTARIO_OPTIONS = [
  { value: 'electronica',   label: 'Electrónica',       code: 'ELE' },
  { value: 'pedido',        label: 'A Pedido',          code: 'PED' },
  { value: 'licitaciones',  label: 'Licitaciones',      code: 'LIC' },
] as const;

export type TipoInventarioValue = typeof TIPO_INVENTARIO_OPTIONS[number]['value'];

export function tipoInventarioCode(value: string | null | undefined): string {
  return TIPO_INVENTARIO_OPTIONS.find(o => o.value === value)?.code ?? 'ELE';
}

export function tipoInventarioLabel(value: string | null | undefined): string {
  return TIPO_INVENTARIO_OPTIONS.find(o => o.value === value)?.label ?? value ?? '—';
}
