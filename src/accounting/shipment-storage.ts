// src/accounting/shipment-storage.ts
// Persistencia de embarques en Supabase

import { Shipment } from './shipment-types';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';

// Helper: convert DB row to Shipment
function rowToShipment(row: any): Shipment {
  const data = (row.data || {}) as Record<string, any>;
  return {
    ...data,
    id: row.id,
    numero: row.numero,
    status: row.status,
    created_at: data.created_at || row.created_at,
  } as Shipment;
}

// Helper: convert Shipment to DB row fields
async function shipmentToRow(s: Shipment, userId: string) {
  const { id, numero, status, ...rest } = s;
  return {
    id,
    user_id: userId,
    company_id: await resolveUserCompanyId(),
    numero,
    status,
    data: JSON.parse(JSON.stringify(rest)) as Json,
  };
}

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  return user.id;
}

export const ShipmentStorage = {
  async load(): Promise<Shipment[]> {
    const companyId = await resolveUserCompanyId();
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToShipment);
  },

  async save(shipments: Shipment[]): Promise<void> {
    const userId = await getUserId();
    const companyId = await resolveUserCompanyId();
    await supabase.from('shipments').delete().eq('company_id', companyId);
    if (shipments.length > 0) {
      const rows = await Promise.all(shipments.map(s => shipmentToRow(s, userId)));
      const { error } = await supabase.from('shipments').insert(rows);
      if (error) throw error;
    }
  },

  async upsert(shipment: Shipment): Promise<void> {
    const userId = await getUserId();
    const row = await shipmentToRow(shipment, userId);
    const { error } = await supabase
      .from('shipments')
      .upsert(row, { onConflict: 'id' });
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getById(id: string): Promise<Shipment | undefined> {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToShipment(data) : undefined;
  },

  // Migration helper: import from localStorage to Supabase
  async migrateFromLocalStorage(): Promise<number> {
    const LS_KEY = 'shipments_v1';
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return 0;
      const old: Shipment[] = JSON.parse(raw);
      if (!old.length) return 0;

      const userId = await getUserId();
      const rows = await Promise.all(old.map(s => shipmentToRow(s, userId)));
      const { error } = await supabase.from('shipments').upsert(rows, { onConflict: 'id' });
      if (error) throw error;

      localStorage.removeItem(LS_KEY);
      return old.length;
    } catch {
      return 0;
    }
  },
};
