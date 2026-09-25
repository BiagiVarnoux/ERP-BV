// src/accounting/shipment-quote-storage.ts
// Persistencia de cotizaciones/proformas de embarque en Supabase.

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { ShipmentQuote, CotizacionProducto } from './shipment-quote-types';

function rowToQuote(row: any): ShipmentQuote {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    numero: row.numero,
    cliente_nombre: row.cliente_nombre ?? undefined,
    fecha: row.fecha,
    productos: (row.productos ?? []) as CotizacionProducto[],
    total_general: Number(row.total_general) || 0,
    created_at: row.created_at,
  };
}

export const ShipmentQuoteStorage = {
  async listByShipment(shipmentId: string, companyId: string): Promise<ShipmentQuote[]> {
    const { data, error } = await supabase
      .from('shipment_cotizaciones')
      .select('*')
      .eq('shipment_id', shipmentId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToQuote);
  },

  async create(quote: Omit<ShipmentQuote, 'id' | 'created_at'>, companyId: string): Promise<ShipmentQuote> {
    const { data, error } = await supabase
      .from('shipment_cotizaciones')
      .insert({
        shipment_id: quote.shipment_id,
        company_id: companyId,
        numero: quote.numero,
        cliente_nombre: quote.cliente_nombre?.trim() || null,
        fecha: quote.fecha,
        productos: quote.productos as unknown as Json,
        total_general: quote.total_general,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToQuote(data);
  },

  async delete(id: string, companyId: string): Promise<void> {
    const { error } = await supabase
      .from('shipment_cotizaciones')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },
};
