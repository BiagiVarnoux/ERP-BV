-- Agrega el estado 'GANADA' a licitaciones (entre PRESENTADA y ADJUDICADA).
-- El CHECK existente solo permitía 7 estados; se recrea incluyendo GANADA.
ALTER TABLE public.licitaciones DROP CONSTRAINT IF EXISTS licitaciones_estado_check;

ALTER TABLE public.licitaciones
  ADD CONSTRAINT licitaciones_estado_check
  CHECK (estado = ANY (ARRAY[
    'BORRADOR'::text,
    'PRESENTADA'::text,
    'GANADA'::text,
    'ADJUDICADA'::text,
    'PERDIDA'::text,
    'DESIERTA'::text,
    'ENTREGADA'::text,
    'COBRADA'::text
  ]));
