-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2b — Backfill exacto lote → embarque (corrige el corrimiento de numeración)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (confirmado por el usuario + verificado por costos del JSONB)
-- El primer embarque real de la empresa fue anterior al sistema de embarques.
-- Al adoptarse el sistema, los números se desplazaron +1: lo que se cerró en el
-- sistema como 'EMB-2026-001' se renombró luego a 'EMB-2026-002', y 'EMB-2026-002'
-- a 'EMB-2026-003'. Pero la columna inventory_movements.referencia CONGELÓ el
-- número viejo al momento del cierre. Resultado: el match por número exacto
-- (migración 20260622000002) enlazó 17 lotes al embarque equivocado.
--
-- MAPEO REAL (referencia congelada → embarque actual):
--   'EMB-2026-001' → EMB-2026-002   (12 lotes)
--   'EMB-2026-002' → EMB-2026-003   (17 lotes)
--   'EMB-2026-004' → EMB-2026-004   ( 2 lotes)
--
-- Verificado: cada lote calza por COSTO + CANTIDAD con un único producto del
-- JSONB del embarque correcto (29 exactos). Las 2 excepciones en EMB-2026-003
-- son dos productos idénticos (mismo costo y cantidad) → intercambiables; se
-- asignan por rango para que cada lote reciba un shipment_product_id distinto.
--
-- SEGURIDAD: solo escribe shipment_id / shipment_product_id (no toca cantidades,
-- costos ni contabilidad). Idempotente. Verificación final aborta si algún lote
-- queda sin embarque.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company uuid := '00000000-0000-0000-0000-000000000001';
  v_updated int;
  v_null    int;
BEGIN
  WITH mapping(ref_numero, real_numero) AS (
    VALUES ('EMB-2026-001','EMB-2026-002'),
           ('EMB-2026-002','EMB-2026-003'),
           ('EMB-2026-004','EMB-2026-004')
  ),
  ent_ranked AS (
    SELECT im.inventory_lot_id AS lot_id, m.real_numero,
           ROUND(im.costo_unitario,2) AS costo, im.cantidad AS cant,
           ROW_NUMBER() OVER (
             PARTITION BY m.real_numero, ROUND(im.costo_unitario,2), im.cantidad
             ORDER BY im.inventory_lot_id) AS rn
    FROM public.inventory_movements im
    JOIN mapping m ON m.ref_numero = split_part(im.referencia,' — ',1)
    WHERE im.company_id = v_company AND im.tipo='ENTRADA'
      AND im.inventory_lot_id IS NOT NULL
  ),
  sp_ranked AS (
    SELECT s.id AS shipment_id, s.numero AS ship_numero, (p->>'id')::uuid AS sp_id,
           ROUND((p->>'costo_total_unitario')::numeric,2) AS costo,
           (p->>'cantidad')::numeric AS cant,
           ROW_NUMBER() OVER (
             PARTITION BY s.numero, ROUND((p->>'costo_total_unitario')::numeric,2), (p->>'cantidad')::numeric
             ORDER BY (p->>'id')) AS rn
    FROM public.shipments s, jsonb_array_elements(s.data->'products') p
    WHERE s.company_id = v_company AND s.status='CERRADO'
  ),
  assign AS (
    SELECT e.lot_id, sp.shipment_id, sp.sp_id
    FROM ent_ranked e
    JOIN sp_ranked sp
      ON sp.ship_numero = e.real_numero
     AND sp.costo = e.costo AND sp.cant = e.cant AND sp.rn = e.rn
  )
  UPDATE public.inventory_lots il
  SET shipment_id = a.shipment_id,
      shipment_product_id = a.sp_id
  FROM assign a
  WHERE il.id = a.lot_id AND il.company_id = v_company;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Verificación: ningún lote debe quedar sin embarque
  SELECT COUNT(*) INTO v_null
  FROM public.inventory_lots
  WHERE company_id = v_company AND shipment_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % lote(s) quedaron sin shipment_id', v_null;
  END IF;

  RAISE NOTICE 'Fase 2b OK: % lotes enlazados a su embarque correcto (0 sin enlace)', v_updated;
END $$;
