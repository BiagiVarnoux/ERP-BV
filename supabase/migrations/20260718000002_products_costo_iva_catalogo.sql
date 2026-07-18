-- Costo total (con IVA de importación) e IVA importado por producto, para
-- la calculadora de ganancia neta/bruta y precio con factura del Catálogo
-- de Ventas (reemplaza la calculadora HTML que el usuario usaba antes por
-- embarque). Son campos manuales de referencia — el usuario los transcribe
-- de su hoja de costeo del embarque, igual que hacía en la calculadora.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS costo_con_iva_bs   numeric(18,2),
  ADD COLUMN IF NOT EXISTS iva_importado_bs   numeric(18,2);
