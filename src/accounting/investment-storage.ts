// src/accounting/investment-storage.ts
// Persistencia del módulo de Análisis de Inversión en Supabase.
// A diferencia de licitaciones/embarques, este storage recibe el companyId
// activo desde la página (useActiveCompanyId) en lugar de resolver la "primera
// membresía" — correcto para el modelo multi-empresa (Holding).

import { supabase } from '@/integrations/supabase/client';
import {
  InvestmentAnalysis, InvestmentItem, InvestmentEstado,
} from './investment-types';

// ─── Ventas reales atribuidas por embarque (Fase 3) ─────────────────────────
// Una fila por producto del embarque (shipment_product_id). Las cifras provienen
// de la cadena exacta lote→venta (RPC get_shipment_realized_sales): solo cuentan
// las ventas que REALMENTE consumieron lotes de ESTE embarque, no las de otros
// embarques del mismo producto.
export interface ShipmentRealizedRow {
  shipment_product_id: string;
  unidades: number;        // unidades vendidas de este embarque
  ingreso_neto: number;    // Σ (unidades × precio_unitario_neto)
  costo: number;           // Σ costo_total (COGS real del lote)
  con_factura: number;     // unidades vendidas con factura
  sin_factura: number;     // unidades vendidas sin factura
  primera_entrada: string | null; // fecha de ingreso a inventario (mínima)
  ultima_venta: string | null;    // fecha de la última venta
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  return user;
}

// ─── Conversores DB ↔ dominio ───────────────────────────────────────────────

function rowToAnalysis(row: Record<string, unknown>): InvestmentAnalysis {
  return {
    id:                      row.id as string,
    company_id:              row.company_id as string,
    user_id:                 (row.user_id as string) || undefined,
    nombre:                  (row.nombre as string) || '',
    notas:                   (row.notas as string) || undefined,
    costo_capital_anual:     row.costo_capital_anual != null ? Number(row.costo_capital_anual) : 12,
    plazo_importacion_meses: row.plazo_importacion_meses != null ? Number(row.plazo_importacion_meses) : 1,
    fuc_pct:                 row.fuc_pct != null ? Number(row.fuc_pct) : 75,
    estado:                  (row.estado as InvestmentEstado) || 'BORRADOR',
    embarque_id:             (row.embarque_id as string) || undefined,
    items:                   [],
    created_at:              row.created_at as string,
    updated_at:              row.updated_at as string,
  };
}

function rowToItem(row: Record<string, unknown>): InvestmentItem {
  return {
    id:                row.id as string,
    analysis_id:       row.analysis_id as string,
    orden:             Number(row.orden) || 0,
    nombre:            (row.nombre as string) || '',
    especificacion:    (row.especificacion as string) || undefined,
    link_producto:     (row.link_producto as string) || undefined,
    hs_code:           (row.hs_code as string) || undefined,
    cantidad:          Number(row.cantidad) || 1,
    tc:                Number(row.tc) || 9.97,
    tc_envio:          row.tc_envio != null ? Number(row.tc_envio) : undefined,
    precio_usd:        Number(row.precio_usd) || 0,
    tax_pct:           Number(row.tax_pct) || 0,
    m1:                row.m1 != null ? Number(row.m1) : undefined,
    m2:                row.m2 != null ? Number(row.m2) : undefined,
    m3:                row.m3 != null ? Number(row.m3) : undefined,
    peso_bruto:        row.peso_bruto != null ? Number(row.peso_bruto) : undefined,
    usa_peso_bruto:    Boolean(row.usa_peso_bruto),
    // Nullish (no `|| default`): 0 es un valor válido que debe preservarse.
    tarifa_envio:      row.tarifa_envio != null ? Number(row.tarifa_envio) : 12,
    tarifa_manipuleo:  row.tarifa_manipuleo != null ? Number(row.tarifa_manipuleo) : 25,
    ga_pct:            row.ga_pct != null ? Number(row.ga_pct) : 5,
    ga_manual:         row.ga_manual != null ? Number(row.ga_manual) : undefined,
    usa_ga_manual:     Boolean(row.usa_ga_manual),
    iva_aduana_manual: row.iva_aduana_manual != null ? Number(row.iva_aduana_manual) : undefined,
    usa_iva_manual:    Boolean(row.usa_iva_manual),
    tiene_bateria:     Boolean(row.tiene_bateria),
    costo_bateria:     Number(row.costo_bateria) || 0,
    modalidad_venta:   (row.modalidad_venta as 'con_factura' | 'sin_factura') || 'con_factura',
    precio_venta:      Number(row.precio_venta) || 0,
    precio_venta_sin_factura: Number(row.precio_venta_sin_factura) || 0,
    cantidad_sin_factura:     Number(row.cantidad_sin_factura) || 0,
    garantia:          Number(row.garantia) || 0,
    pasaje:            Number(row.pasaje) || 0,
    envio_local:       Number(row.envio_local) || 0,
    otros_costos:      Number(row.otros_costos) || 0,
    velocidad_venta:   Number(row.velocidad_venta) || 0,
    meses_venta_override: row.meses_venta_override != null ? Number(row.meses_venta_override) : undefined,
    mapped_shipment_product_ids: Array.isArray(row.mapped_shipment_product_ids)
      ? (row.mapped_shipment_product_ids as string[]) : [],
    created_at:        row.created_at as string,
    updated_at:        row.updated_at as string,
  };
}

function itemToRow(it: InvestmentItem) {
  return {
    id:                it.id,
    analysis_id:       it.analysis_id,
    orden:             it.orden,
    nombre:            it.nombre,
    especificacion:    it.especificacion ?? null,
    link_producto:     it.link_producto ?? null,
    hs_code:           it.hs_code ?? null,
    cantidad:          it.cantidad,
    tc:                it.tc,
    tc_envio:          it.tc_envio ?? null,
    precio_usd:        it.precio_usd,
    tax_pct:           it.tax_pct,
    m1:                it.m1 ?? null,
    m2:                it.m2 ?? null,
    m3:                it.m3 ?? null,
    peso_bruto:        it.peso_bruto ?? null,
    usa_peso_bruto:    it.usa_peso_bruto,
    tarifa_envio:      it.tarifa_envio,
    tarifa_manipuleo:  it.tarifa_manipuleo,
    ga_pct:            it.ga_pct,
    ga_manual:         it.ga_manual ?? null,
    usa_ga_manual:     it.usa_ga_manual,
    iva_aduana_manual: it.iva_aduana_manual ?? null,
    usa_iva_manual:    it.usa_iva_manual,
    tiene_bateria:     it.tiene_bateria,
    costo_bateria:     it.costo_bateria,
    modalidad_venta:   it.modalidad_venta,
    precio_venta:      it.precio_venta,
    precio_venta_sin_factura: it.precio_venta_sin_factura,
    cantidad_sin_factura:     it.cantidad_sin_factura,
    garantia:          it.garantia,
    pasaje:            it.pasaje,
    envio_local:       it.envio_local,
    otros_costos:      it.otros_costos,
    velocidad_venta:   it.velocidad_venta,
    meses_venta_override: it.meses_venta_override ?? null,
    mapped_shipment_product_ids: it.mapped_shipment_product_ids ?? [],
  };
}

// ─── InvestmentStorage ──────────────────────────────────────────────────────

export const InvestmentStorage = {

  async loadAll(companyId: string): Promise<InvestmentAnalysis[]> {
    const { data, error } = await supabase
      .from('investment_analyses')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => rowToAnalysis(r as Record<string, unknown>));
  },

  async loadOne(id: string): Promise<InvestmentAnalysis> {
    const [aRes, itemsRes] = await Promise.all([
      supabase.from('investment_analyses').select('*').eq('id', id).single(),
      supabase.from('investment_analysis_items').select('*').eq('analysis_id', id).order('orden'),
    ]);
    if (aRes.error) throw aRes.error;
    if (itemsRes.error) throw itemsRes.error;
    const a = rowToAnalysis(aRes.data as Record<string, unknown>);
    a.items = (itemsRes.data || []).map(r => rowToItem(r as Record<string, unknown>));
    return a;
  },

  async create(
    companyId: string,
    a: Pick<InvestmentAnalysis, 'nombre' | 'notas' | 'costo_capital_anual' | 'plazo_importacion_meses'>,
  ): Promise<InvestmentAnalysis> {
    const user = await getUser();
    const { data, error } = await supabase
      .from('investment_analyses')
      .insert({
        company_id:              companyId,
        user_id:                 user.id,
        nombre:                  a.nombre,
        notas:                   a.notas ?? null,
        costo_capital_anual:     a.costo_capital_anual,
        plazo_importacion_meses: a.plazo_importacion_meses,
      })
      .select()
      .single();
    if (error) throw error;
    const result = rowToAnalysis(data as Record<string, unknown>);
    result.items = [];
    return result;
  },

  async update(
    id: string,
    companyId: string,
    changes: Partial<Omit<InvestmentAnalysis, 'id' | 'company_id' | 'user_id' | 'items' | 'created_at' | 'updated_at'>>
      & { embarque_id?: string | null },
  ): Promise<void> {
    const { error } = await supabase
      .from('investment_analyses')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  async delete(id: string, companyId: string): Promise<void> {
    const { error } = await supabase
      .from('investment_analyses')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  // ─── Items ────────────────────────────────────────────────────────────────

  async upsertItems(companyId: string, items: InvestmentItem[]): Promise<void> {
    if (items.length === 0) return;
    // Verificar que los analysis_id pertenecen a la empresa (defensa S2 IDOR)
    const analysisIds = [...new Set(items.map(i => i.analysis_id))];
    const { data: owned, error: ownerErr } = await supabase
      .from('investment_analyses')
      .select('id')
      .in('id', analysisIds)
      .eq('company_id', companyId);
    if (ownerErr) throw ownerErr;
    const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id));
    const safe = items.filter(i => ownedIds.has(i.analysis_id));
    if (safe.length === 0) return;
    const { error } = await supabase
      .from('investment_analysis_items')
      .upsert(safe.map(itemToRow));
    if (error) throw error;
  },

  async deleteItem(id: string, analysisId: string): Promise<void> {
    const { error } = await supabase
      .from('investment_analysis_items')
      .delete()
      .eq('id', id)
      .eq('analysis_id', analysisId);
    if (error) throw error;
  },

  // ─── Fase 3: ventas reales atribuidas a un embarque ───────────────────────
  // Cadena exacta lote→venta vía RPC. Devuelve un mapa shipment_product_id → fila.
  // Solo hay datos si el embarque está cerrado (sus lotes ya existen y se
  // consumieron). Productos sin ventas atribuibles simplemente no aparecen.
  async fetchShipmentRealized(
    companyId: string, shipmentId: string,
  ): Promise<Record<string, ShipmentRealizedRow>> {
    const { data, error } = await supabase.rpc('get_shipment_realized_sales', {
      p_company_id: companyId,
      p_shipment_id: shipmentId,
    });
    if (error) throw error;

    const map: Record<string, ShipmentRealizedRow> = {};
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const spid = r.shipment_product_id as string;
      map[spid] = {
        shipment_product_id: spid,
        unidades:        Number(r.unidades) || 0,
        ingreso_neto:    Number(r.ingreso_neto) || 0,
        costo:           Number(r.costo) || 0,
        con_factura:     Number(r.con_factura) || 0,
        sin_factura:     Number(r.sin_factura) || 0,
        primera_entrada: (r.primera_entrada as string) || null,
        ultima_venta:    (r.ultima_venta as string) || null,
      };
    }
    return map;
  },
};
