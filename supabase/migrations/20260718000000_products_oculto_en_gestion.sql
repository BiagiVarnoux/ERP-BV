-- Permite ocultar un producto de la vista "Gestionar" del Catálogo de Ventas
-- (ej. productos reservados para licitaciones que no están a la venta ahora
-- y solo ocupan espacio mientras se ponen precios a otros). Independiente de
-- mostrar_en_catalogo (que controla si el VENDEDOR lo ve) — este campo
-- controla si el DUEÑO lo ve en la lista de gestión.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS oculto_en_gestion boolean NOT NULL DEFAULT false;
