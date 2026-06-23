-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3a — Backfill de lote en ventas históricas (CPP → atribución FIFO exacta)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- Las salidas históricas son CPP, con inventory_lot_id = NULL. Sin ese enlace la
-- trazabilidad exacta (venta → lote → embarque) no ve las ventas históricas.
-- Como ya migramos a FIFO y reconciliamos lotes, el lote de cada venta es
-- reconstruible: se replaya el consumo FIFO cronológico (todas las salidas) y se
-- asigna a cada venta el/los lote(s) que consumió.
--
-- VENTAS QUE CRUZAN DOS LOTES (p.ej. "Entrega 100 etiquetas": 20 de un lote de
-- EMB-2026-002 + 80 de un lote de EMB-2026-004) se DIVIDEN en varios movimientos,
-- repartiendo cantidad y costo_total PROPORCIONALMENTE. Así:
--   • el COGS total de la venta NO cambia (Σ costo_total = original) → contabilidad intacta;
--   • cada porción queda enlazada a su lote/embarque real → atribución exacta.
-- Es la misma representación que create_sale genera nativamente para ventas FIFO
-- multi-lote (un movimiento por lote).
--
-- SEGURIDAD
--   • No toca asientos (journal_*), ni cantidades/costos AGREGADOS de la venta.
--   • Gate 1: el remanente FIFO simulado debe igualar cantidad_disponible real.
--   • Gate 2: por cada venta, Σ(cantidad de las porciones)=cantidad original y
--     Σ(costo_total de las porciones)=costo_total original.
--   • Reversible: las porciones extra se identifican por referencia con sufijo
--     ' [FIFO split]'. Todo corre en una transacción; cualquier fallo → ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company uuid := '00000000-0000-0000-0000-000000000001';
  r_prod    RECORD;
  r_sal     RECORD;
  r_lot     RECORD;
  v_remaining numeric;
  v_seq       int;
  v_mismatch  int;
  v_bad       int;
BEGIN
  -- Estado temporal de lotes (capacidad inicial; se consume en el replay)
  CREATE TEMP TABLE _lotstate ON COMMIT DROP AS
    SELECT id, product_id, cantidad_inicial::numeric AS remaining, fecha_ingreso, created_at
    FROM public.inventory_lots WHERE company_id = v_company;

  -- Consumo registrado por salida (una fila por lote tocado)
  CREATE TEMP TABLE _consumption (
    mov_id uuid, is_sale boolean, seq int, lot_id uuid, qty numeric
  ) ON COMMIT DROP;

  -- ── Replay FIFO cronológico ────────────────────────────────────────────────
  FOR r_prod IN
    SELECT DISTINCT product_id FROM public.inventory_movements
    WHERE company_id = v_company AND tipo = 'SALIDA'
  LOOP
    FOR r_sal IN
      SELECT im.id AS mov_id, im.cantidad,
             EXISTS (SELECT 1 FROM public.sales s
                     WHERE s.journal_entry_id = im.journal_entry_id
                       AND s.estado = 'confirmed') AS is_sale
      FROM public.inventory_movements im
      WHERE im.company_id = v_company AND im.tipo = 'SALIDA' AND im.product_id = r_prod.product_id
      ORDER BY im.fecha, im.created_at
    LOOP
      v_remaining := r_sal.cantidad;
      v_seq := 0;
      FOR r_lot IN
        SELECT id, remaining FROM _lotstate
        WHERE product_id = r_prod.product_id AND remaining > 0
        ORDER BY fecha_ingreso, created_at
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_seq := v_seq + 1;
        IF r_lot.remaining >= v_remaining THEN
          INSERT INTO _consumption VALUES (r_sal.mov_id, r_sal.is_sale, v_seq, r_lot.id, v_remaining);
          UPDATE _lotstate SET remaining = remaining - v_remaining WHERE id = r_lot.id;
          v_remaining := 0;
        ELSE
          INSERT INTO _consumption VALUES (r_sal.mov_id, r_sal.is_sale, v_seq, r_lot.id, r_lot.remaining);
          v_remaining := v_remaining - r_lot.remaining;
          UPDATE _lotstate SET remaining = 0 WHERE id = r_lot.id;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Gate 1: el remanente simulado debe coincidir con cantidad_disponible real
  SELECT COUNT(*) INTO v_mismatch
  FROM _lotstate ls JOIN public.inventory_lots il ON il.id = ls.id
  WHERE ABS(ls.remaining - il.cantidad_disponible) > 0.001;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % lote(s) con remanente FIFO != cantidad_disponible', v_mismatch;
  END IF;

  -- ── Aplicar a las VENTAS: porción 1 = update; porciones 2+ = insert ─────────
  -- Datos de cada porción + costo proporcional (la última porción cuadra el resto)
  CREATE TEMP TABLE _apply ON COMMIT DROP AS
  WITH parts AS (
    SELECT c.mov_id, c.seq, c.lot_id, c.qty,
           om.cantidad AS orig_qty, om.costo_total AS orig_costo, om.costo_unitario AS orig_cu,
           om.product_id, om.tipo, om.metodo_valuacion, om.referencia,
           om.journal_entry_id, om.fecha, om.user_id, om.company_id,
           COUNT(*)  OVER (PARTITION BY c.mov_id) AS n_parts,
           SUM(round(om.costo_total * c.qty / om.cantidad, 2))
             OVER (PARTITION BY c.mov_id ORDER BY c.seq
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_costo
    FROM _consumption c
    JOIN public.inventory_movements om ON om.id = c.mov_id
    WHERE c.is_sale
  )
  SELECT mov_id, seq, lot_id, qty, orig_qty, orig_costo, orig_cu, n_parts,
         product_id, tipo, metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id,
         CASE WHEN seq = n_parts THEN orig_costo - COALESCE(prev_costo, 0)
              ELSE round(orig_costo * qty / orig_qty, 2) END AS portion_costo
  FROM parts;

  -- Porción 1: actualizar el movimiento original (lote + porción)
  UPDATE public.inventory_movements im
  SET inventory_lot_id = a.lot_id,
      cantidad         = a.qty,
      costo_total      = a.portion_costo
  FROM _apply a
  WHERE im.id = a.mov_id AND a.seq = 1;

  -- Porciones 2+: insertar movimientos nuevos (split), marcados en la referencia
  INSERT INTO public.inventory_movements
    (product_id, inventory_lot_id, tipo, cantidad, costo_unitario, costo_total,
     metodo_valuacion, referencia, journal_entry_id, fecha, user_id, company_id)
  SELECT a.product_id, a.lot_id, a.tipo, a.qty, a.orig_cu, a.portion_costo,
         a.metodo_valuacion, a.referencia || ' [FIFO split]', a.journal_entry_id,
         a.fecha, a.user_id, a.company_id
  FROM _apply a
  WHERE a.seq > 1;

  -- Gate 2: por cada venta, Σ cantidad y Σ costo_total de las porciones = original
  SELECT COUNT(*) INTO v_bad FROM (
    SELECT a.mov_id,
           MAX(a.orig_qty)   AS oq, SUM(a.qty)           AS sq,
           MAX(a.orig_costo) AS oc, SUM(a.portion_costo) AS sc
    FROM _apply a GROUP BY a.mov_id
  ) t
  WHERE ABS(oq - sq) > 0.001 OR ABS(oc - sc) > 0.01;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % venta(s) con porciones que no cuadran (qty o costo)', v_bad;
  END IF;

  RAISE NOTICE 'Fase 3a OK: ventas históricas enlazadas a su lote (con split FIFO donde correspondía)';
END $$;
