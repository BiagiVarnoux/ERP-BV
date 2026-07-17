-- Campos para el Catálogo de Ventas (vista de vendedores a comisión).
-- precio_minimo_negociacion es un campo NUEVO y separado del ya existente
-- products.precio_minimo (que es una alerta interna en el módulo de Ventas si
-- el precio neto cae debajo de ese valor) — no se reutiliza para no pisar su
-- significado ni sus valores ya cargados.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS precio_lista               numeric(18,2),
  ADD COLUMN IF NOT EXISTS precio_minimo_negociacion   numeric(18,2),
  ADD COLUMN IF NOT EXISTS comision_bs                 numeric(18,2),
  ADD COLUMN IF NOT EXISTS descripcion_catalogo        text,
  ADD COLUMN IF NOT EXISTS mostrar_en_catalogo         boolean NOT NULL DEFAULT false;
