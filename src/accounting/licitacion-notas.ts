// src/accounting/licitacion-notas.ts
// Config de "Datos para notas" por empresa + tipos de notas de licitación.
// Los datos fijos del proveedor se guardan UNA vez por empresa (tabla
// licitacion_notas_config) y se reutilizan en todas las notas de todas las
// licitaciones. Lo variable por licitación vive en la propia licitación / cotizador.

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// ─── Tipos de nota ────────────────────────────────────────────────────────────

export type NotaTipo = 'entrega_documentos' | 'nota_entrega' | 'garantia' | 'solicitud_pago';

export const NOTA_LABELS: Record<NotaTipo, string> = {
  entrega_documentos: 'Entrega de Documentos',
  nota_entrega:       'Nota de Entrega',
  garantia:           'Garantía',
  solicitud_pago:     'Solicitud de Pago',
};

// Nº de nota para el CITE (BV/LC Nº {NN}-{MM}/{AAAA}). La garantía NO lleva CITE.
export const NOTA_CITE_NRO: Record<NotaTipo, string | null> = {
  entrega_documentos: '01',
  nota_entrega:       '02',
  garantia:           null,
  solicitud_pago:     '03',
};

// ─── Config de empresa (datos fijos del proveedor) ────────────────────────────

export interface NotasEmpresaConfig {
  representante: string;      // ej. "Carlos Fabrizio Cuellar Salazar"
  rol: string;               // ej. "propietario"
  empresa: string;           // ej. "Biagi & Varnoux - Import and Export"
  nit: string;
  ciudad: string;            // ciudad por defecto del encabezado (ej. "Sucre")
  cite_prefijo: string;      // ej. "BV/LC"
  banco: string;             // ej. "Banco Unión"
  cuenta: string;            // ej. "10000065282043"
  documentos: string[];      // líneas de la nota "Entrega de Documentos"
}

export const NOTAS_CONFIG_DEFAULT: NotasEmpresaConfig = {
  representante: '',
  rol: 'propietario',
  empresa: '',
  nit: '',
  ciudad: '',
  cite_prefijo: 'BV/LC',
  banco: '',
  cuenta: '',
  documentos: [
    'Certificado RUPE - No. ',
    'Fotocopia de C.I.',
    'Matrícula de Comercio Actualizada',
    'Certificado de Registro en el RNC',
    'Certificado de Inscripción en el Padrón Nacional de Contribuyentes (NIT)',
    'Certificado de no Adeudo - No ',
    'Formulario de Inscripción de Empresas Unipersonales sin Dependientes - FIEUD.',
    'Registro de Beneficiario SIGEP',
  ],
};

// ─── Datos de notas POR licitación (overrides) ────────────────────────────────

// Override por producto del cotizador (cantidad y precio salen del cotizador;
// descripción, Nº de ítem del DBC, unidad y cantidad de garantía se cargan aquí).
export interface NotaItemOverride {
  nro_dbc: string;
  descripcion: string;
  unidad: string;
  cant_garantia: number | null;
}

export interface LicitacionNotasDatos {
  tratamiento: string;              // 'Señor:', 'Señora:', 'Señor(es):'
  destinatario_nombre: string;
  destinatario_cargo: string;
  destinatario_reparticion: string;
  ciudad: string;                   // si vacío, usa la ciudad de la config
  fecha: string;                    // ISO 'YYYY-MM-DD'
  nro_licitacion_anual: string;     // {MM} del CITE
  items: Record<string, NotaItemOverride>; // keyed by producto.id
}

export const NOTAS_DATOS_DEFAULT: LicitacionNotasDatos = {
  tratamiento: 'Señor(es):',
  destinatario_nombre: '',
  destinatario_cargo: '',
  destinatario_reparticion: '',
  ciudad: '',
  fecha: '',
  nro_licitacion_anual: '',
  items: {},
};

export function leerNotasDatos(datosIa: Record<string, unknown> | undefined | null): LicitacionNotasDatos {
  const n = (datosIa?.notas as Partial<LicitacionNotasDatos> | undefined) ?? {};
  return { ...NOTAS_DATOS_DEFAULT, ...n, items: n.items ?? {} };
}

// ─── Storage (una fila por empresa) ───────────────────────────────────────────

export const NotasConfigStorage = {
  async load(companyId: string | null): Promise<NotasEmpresaConfig> {
    if (!companyId) return { ...NOTAS_CONFIG_DEFAULT };
    const { data, error } = await supabase
      .from('licitacion_notas_config')
      .select('data')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    const stored = (data?.data as Partial<NotasEmpresaConfig> | undefined) ?? {};
    return { ...NOTAS_CONFIG_DEFAULT, ...stored };
  },

  async save(companyId: string | null, cfg: NotasEmpresaConfig): Promise<void> {
    if (!companyId) throw new Error('No hay empresa activa');
    const { error } = await supabase
      .from('licitacion_notas_config')
      .upsert(
        { company_id: companyId, data: cfg as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' },
      );
    if (error) throw error;
  },
};
