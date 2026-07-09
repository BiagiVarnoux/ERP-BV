-- Precio referencial ofertado por la entidad convocante, por producto de la cotización.
-- Sirve solo de referencia para comparar contra el precio ofertado propio; NO entra
-- en ningún cálculo de costo/rentabilidad.
--
-- Operación NO destructiva: solo añade una columna nullable. Las filas existentes
-- quedan en NULL (sin referencia), sin afectar ningún cálculo previo.

ALTER TABLE public.licitacion_productos
  ADD COLUMN IF NOT EXISTS precio_entidad numeric;

COMMENT ON COLUMN public.licitacion_productos.precio_entidad IS
  'Precio referencial ofertado por la entidad (Bs/unidad). Solo referencia, no entra al cálculo.';
