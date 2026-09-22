-- IVA tomado del documento en vez de calculado.
--
-- En las importaciones el IVA no es el 13% "por dentro" de la factura: la Aduana
-- lo liquida sobre CIF + GA con la tasa efectiva del 14,94% y lo imprime en la
-- DIM. Recalcularlo daría un número distinto al declarado, así que para las DIM
-- (y para cualquier documento con una liquidación propia) se guarda el importe
-- exacto del documento y no se deriva de la base.
ALTER TABLE public.tax_documents
  ADD COLUMN IF NOT EXISTS usa_iva_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tax_documents.usa_iva_manual IS
  'true = `iva` viene del documento (DIM/DUI) y no se recalcula desde base_imponible × alicuota.';
