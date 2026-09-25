-- N° de declaración de una DIM/DIMS (campo A1, ej. DI-2026-211-2343756).
-- Antes se guardaba dentro de `notas` porque no tenía columna propia, lo que
-- impedía buscarlo y lo mezclaba con las notas del usuario.
ALTER TABLE public.tax_documents
  ADD COLUMN IF NOT EXISTS numero_declaracion text;

COMMENT ON COLUMN public.tax_documents.numero_declaracion IS
  'N° de declaración de la DIM/DIMS (campo A1). Solo aplica a tipo_documento = dui.';

-- Backfill: rescata el número de las filas que lo tenían en notas como "DIM <n°>"
-- y limpia la nota para no duplicar el dato.
UPDATE public.tax_documents
SET numero_declaracion = substring(notas from '^DIM\s+(\S+)'),
    notas = NULLIF(btrim(regexp_replace(notas, '^DIM\s+\S+', '')), '')
WHERE numero_declaracion IS NULL
  AND notas ~ '^DIM\s+\S+';

CREATE INDEX IF NOT EXISTS idx_tax_documents_numero_declaracion
  ON public.tax_documents (company_id, numero_declaracion)
  WHERE numero_declaracion IS NOT NULL;
