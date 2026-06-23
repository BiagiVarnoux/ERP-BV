-- ════════════════════════════════════════════════════════════════════════════
-- FASE 1 — Migración CPP → FIFO (empresa Biagi & Varnoux, ...001)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- Las ventas históricas se registraron con método CPP. CPP descuenta de un pool
-- promedio y NO toca inventory_lots. Por eso los lotes (creados al cerrar
-- embarques) quedaron SOBRESTIMADOS: su cantidad_disponible nunca se decrementó.
--
-- Esta migración:
--   1. Reconcilia cantidad_disponible de los lotes al stock real (calculado desde
--      inventory_movements), consumiendo lotes en orden FIFO (más antiguo primero).
--   2. Absorbe los AJUSTE_COSTO capitalizados en el costo del lote activo restante
--      (caso iPhone 14 Pro Max Cracked: +790 Bs) para que el sub-mayor de lotes
--      cuadre con el mayor contable.
--   3. Cambia todos los productos de la empresa a metodo_valuacion = 'FIFO'.
--
-- SEGURIDAD
--   • Todo corre en un único bloque DO (transacción atómica).
--   • Puerta de verificación al final: si los lotes no cuadran con el stock real,
--     o hay cantidades negativas, hace RAISE EXCEPTION → ROLLBACK total.
--   • NO toca inventory_movements ni journal_* — la contabilidad histórica intacta.
--   • Idempotente: re-ejecutarla no produce cambios (los lotes ya cuadran).
--   • Decisión de negocio (aprobada): la divergencia FIFO/CPP de las Etiquetas
--     (~55 Bs) fluye por COGS al vender; NO se crea asiento de revaluación.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company  uuid := '00000000-0000-0000-0000-000000000001';
  v_neg      int;
  v_bad      int;
  v_flipped  int;
BEGIN
  -- ── 1. Reconciliar cantidad_disponible de lotes (FIFO: más antiguo primero) ──
  UPDATE public.inventory_lots il
  SET cantidad_disponible =
        il.cantidad_disponible
        - LEAST(il.cantidad_disponible, GREATEST(0, calc.rem - calc.prev_cum))
  FROM (
    SELECT lo.id, lo.prev_cum, tr.rem
    FROM (
      SELECT id, product_id, cantidad_disponible,
             COALESCE(SUM(cantidad_disponible) OVER (
               PARTITION BY product_id
               ORDER BY fecha_ingreso, created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev_cum
      FROM public.inventory_lots
      WHERE company_id = v_company
    ) lo
    JOIN (
      SELECT lt.product_id, lt.lot_disp - GREATEST(COALESCE(rs.rs, 0), 0) AS rem
      FROM (
        SELECT product_id, SUM(cantidad_disponible) AS lot_disp
        FROM public.inventory_lots WHERE company_id = v_company GROUP BY product_id
      ) lt
      LEFT JOIN (
        SELECT product_id,
               SUM(CASE WHEN tipo='ENTRADA' THEN cantidad
                        WHEN tipo='SALIDA'  THEN -cantidad ELSE 0 END) AS rs
        FROM public.inventory_movements WHERE company_id = v_company GROUP BY product_id
      ) rs USING (product_id)
    ) tr ON tr.product_id = lo.product_id
  ) calc
  WHERE il.id = calc.id;

  -- ── 2. Absorber AJUSTE_COSTO capitalizado en el lote activo restante ─────────
  --     (productos con movimientos AJUSTE_COSTO: el lote restante toma el costo
  --      unitario contable = valor_GL / stock_real). En estos datos: solo iPhone.
  UPDATE public.inventory_lots il
  SET costo_unitario = gl.gl_unit
  FROM (
    SELECT product_id,
           SUM(CASE WHEN tipo='ENTRADA'      THEN costo_total
                    WHEN tipo='SALIDA'       THEN -costo_total
                    WHEN tipo='AJUSTE_COSTO' THEN costo_total ELSE 0 END)
           / NULLIF(SUM(CASE WHEN tipo='ENTRADA' THEN cantidad
                             WHEN tipo='SALIDA'  THEN -cantidad ELSE 0 END), 0) AS gl_unit
    FROM public.inventory_movements
    WHERE company_id = v_company
    GROUP BY product_id
    HAVING bool_or(tipo = 'AJUSTE_COSTO')
  ) gl
  WHERE il.product_id = gl.product_id
    AND il.company_id = v_company
    AND il.cantidad_disponible > 0
    AND gl.gl_unit IS NOT NULL;

  -- ── 3. Cambiar productos a FIFO ─────────────────────────────────────────────
  UPDATE public.products
  SET metodo_valuacion = 'FIFO'
  WHERE company_id = v_company AND metodo_valuacion = 'CPP';
  GET DIAGNOSTICS v_flipped = ROW_COUNT;

  -- ── 4. PUERTA DE VERIFICACIÓN (aborta + rollback si algo no cuadra) ──────────
  -- 4a. Ningún lote puede quedar negativo
  SELECT COUNT(*) INTO v_neg
  FROM public.inventory_lots
  WHERE company_id = v_company AND cantidad_disponible < -0.0001;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % lote(s) con cantidad_disponible negativa', v_neg;
  END IF;

  -- 4b. La suma de lotes por producto debe igualar el stock real de movimientos
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT COALESCE(lt.lot_disp, 0) AS ld, GREATEST(COALESCE(rs.rs, 0), 0) AS rsv
    FROM (
      SELECT product_id, SUM(cantidad_disponible) AS lot_disp
      FROM public.inventory_lots WHERE company_id = v_company GROUP BY product_id
    ) lt
    FULL JOIN (
      SELECT product_id,
             SUM(CASE WHEN tipo='ENTRADA' THEN cantidad
                      WHEN tipo='SALIDA'  THEN -cantidad ELSE 0 END) AS rs
      FROM public.inventory_movements WHERE company_id = v_company GROUP BY product_id
    ) rs USING (product_id)
  ) chk
  WHERE ABS(ld - rsv) > 0.001;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % producto(s) con lotes descuadrados vs stock real', v_bad;
  END IF;

  RAISE NOTICE 'FASE 1 OK — % productos cambiados a FIFO, lotes reconciliados y verificados', v_flipped;
END $$;
