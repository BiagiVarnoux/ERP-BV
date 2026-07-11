-- Migration: soporte de productos "compra local" (no importados) en licitaciones
-- File: 20260710000000_add_origen_local_licitacion_productos.sql
--
-- No todos los productos de una licitación son importados: algunos se compran
-- dentro de Bolivia (más baratos localmente). Estos productos no llevan
-- gravamen arancelario, IVA aduanero, flete internacional ni T/C — solo un
-- precio de compra en Bs, con crédito fiscal opcional si hay factura.

ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'importado'
    CHECK (origen IN ('importado', 'local')),
  ADD COLUMN IF NOT EXISTS precio_local numeric,
  ADD COLUMN IF NOT EXISTS tiene_factura boolean NOT NULL DEFAULT false;
