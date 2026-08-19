-- La cuenta de inventario vivía solo a nivel de PRODUCTO (products.cuenta_inventario_id).
-- Para poder transferir unidades de una cuenta a otra (p.ej. Inventario-Licitaciones
-- A.4.3 → Inventario-Otros A.4.6) y que la venta acredite la cuenta correcta de CADA
-- lote, la cuenta debe vivir a nivel de LOTE. Agregamos la columna y hacemos backfill
-- desde el producto. La venta (create_sale) usará el valor del lote con fallback al
-- producto (para lotes viejos sin backfill o de otro origen).
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS cuenta_inventario_id text;

UPDATE public.inventory_lots l
   SET cuenta_inventario_id = p.cuenta_inventario_id
  FROM public.products p
 WHERE p.id = l.product_id
   AND l.cuenta_inventario_id IS NULL;
