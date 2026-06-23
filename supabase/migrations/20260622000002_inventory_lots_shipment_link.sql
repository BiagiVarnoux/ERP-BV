-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 — Trazabilidad lote → embarque
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- inventory_lots.import_lot_id apuntaba a import_lots, pero esa tabla nunca se
-- pobló (cadena muerta). Los productos de un embarque viven en shipments.data
-- (jsonb), cada uno con su propio id (uuid). El Análisis de Inversión mapea sus
-- ítems a esos ids (mapped_shipment_product_ids).
--
-- Esta migración agrega el enlace DIRECTO del lote a su embarque y al producto
-- del embarque, que es lo que la trazabilidad (Fase 3) necesita:
--   inventory_lots.shipment_id         → shipments.id
--   inventory_lots.shipment_product_id → id del producto dentro de shipments.data
--                                        (no es FK: es un elemento de un jsonb)
--
-- BACKFILL
-- Solo se rellena shipment_id para lotes cuyo movimiento ENTRADA referencia un
-- número de embarque que EXISTE en la tabla shipments (match exacto y seguro).
-- Los datos históricos tienen números desalineados (p.ej. movimientos que citan
-- 'EMB-2026-001', embarque que ya no existe) — esos lotes quedan en NULL.
-- shipment_product_id NO se backfillea aquí (los nombres del catálogo fueron
-- editados y el match histórico requiere revisión manual — se hará en Fase 3).
--
-- SEGURIDAD: columnas nuevas nullable, no rompe inserts existentes. El backup
-- (cliente: select *; servidor: to_jsonb) incluye las columnas automáticamente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS shipment_id uuid
    REFERENCES public.shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipment_product_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_lots_shipment_id
  ON public.inventory_lots(shipment_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_shipment_product_id
  ON public.inventory_lots(shipment_product_id);

-- Backfill seguro de shipment_id (solo match exacto de número de embarque)
DO $$
DECLARE
  v_company  uuid := '00000000-0000-0000-0000-000000000001';
  v_linked   int;
BEGIN
  UPDATE public.inventory_lots il
  SET shipment_id = m.sid
  FROM (
    SELECT DISTINCT im.inventory_lot_id AS lot, s.id AS sid
    FROM public.inventory_movements im
    JOIN public.shipments s
      ON s.company_id = im.company_id
     AND s.numero = split_part(im.referencia, ' — ', 1)
    WHERE im.company_id = v_company
      AND im.tipo = 'ENTRADA'
      AND im.inventory_lot_id IS NOT NULL
  ) m
  WHERE il.id = m.lot
    AND il.company_id = v_company
    AND il.shipment_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RAISE NOTICE 'Fase 2: % lotes enlazados a su embarque por número exacto', v_linked;
END $$;
