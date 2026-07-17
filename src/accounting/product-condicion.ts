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
// Las opciones ya NO están fijas acá — se gestionan por empresa en Ajustes →
// Categorías (tabla product_tipos_inventario, ver src/hooks/useProductTipos.ts).
// Estas funciones son solo un fallback para cuando no se tiene la lista cargada.

interface TipoInventarioLike {
  valor: string;
  nombre: string;
  codigo: string;
}

const TIPO_INVENTARIO_FALLBACK: TipoInventarioLike[] = [
  { valor: 'electronica',  nombre: 'Electrónica', codigo: 'ELE' },
  { valor: 'pedido',       nombre: 'A Pedido',     codigo: 'PED' },
  { valor: 'licitaciones', nombre: 'Licitaciones', codigo: 'LIC' },
];

export function tipoInventarioCode(value: string | null | undefined, tipos?: TipoInventarioLike[]): string {
  const list = tipos && tipos.length > 0 ? tipos : TIPO_INVENTARIO_FALLBACK;
  return list.find(o => o.valor === value)?.codigo ?? list[0]?.codigo ?? 'ELE';
}

export function tipoInventarioLabel(value: string | null | undefined, tipos?: TipoInventarioLike[]): string {
  const list = tipos && tipos.length > 0 ? tipos : TIPO_INVENTARIO_FALLBACK;
  return list.find(o => o.valor === value)?.nombre ?? value ?? '—';
}
