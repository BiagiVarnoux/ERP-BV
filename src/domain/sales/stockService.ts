import { supabase } from '@/integrations/supabase/client';
import type { Canal, ProductStockInfo } from './types';

/**
 * Carga el stock disponible y CPP de múltiples productos en una sola
 * llamada al RPC get_products_stock_batch.
 * Retorna un mapa product_id → ProductStockInfo para acceso O(1).
 */
export async function fetchProductsStockBatch(
  productIds: string[]
): Promise<Record<string, ProductStockInfo>> {
  if (productIds.length === 0) return {};

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase.rpc('get_products_stock_batch', {
    p_product_ids: productIds,
    p_user_id: user.id,
  });

  if (error) throw new Error(error.message);

  const map: Record<string, ProductStockInfo> = {};
  // data es any[] por ser respuesta de RPC no tipado en el cliente generado
  for (const row of (data ?? []) as ProductStockInfo[]) {
    map[row.product_id] = row;
  }
  return map;
}

/**
 * Retorna el último precio neto al que se vendió cada producto en un canal dado.
 * Útil para sugerir precio al agregar un producto al modal de venta.
 */
export async function fetchLastPricesByCanal(
  productIds: string[],
  canal: Canal
): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};

  // Obtener las últimas 300 ventas confirmadas del canal para tener cobertura suficiente
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id')
    .eq('canal', canal)
    .eq('estado', 'confirmed')
    .order('fecha', { ascending: false })
    .limit(300);

  if (salesErr || !sales?.length) return {};

  const saleIds = sales.map(s => s.id);

  const { data: items, error: itemsErr } = await supabase
    .from('sale_items')
    .select('product_id, precio_unitario_neto, sale_id')
    .in('product_id', productIds)
    .in('sale_id', saleIds);

  if (itemsErr || !items?.length) return {};

  // Mantener solo el primer hit por producto (el más reciente, gracias al order de sales)
  const saleOrder = new Map(saleIds.map((id, i) => [id, i]));
  const sorted = [...items].sort(
    (a, b) => (saleOrder.get(a.sale_id) ?? 999) - (saleOrder.get(b.sale_id) ?? 999)
  );

  const result: Record<string, number> = {};
  for (const row of sorted) {
    if (!(row.product_id in result)) {
      result[row.product_id] = Number(row.precio_unitario_neto);
    }
  }
  return result;
}
