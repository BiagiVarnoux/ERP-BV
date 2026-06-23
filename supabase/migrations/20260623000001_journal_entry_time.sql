-- Añade hora opcional (HH:mm) a los asientos del libro diario.
-- Sirve para desempatar el orden de asientos del MISMO día de forma consistente
-- entre el Libro Diario, el Libro Mayor y los auxiliares (CPP/Kárdex).
--
-- Es 100% aditiva y NULLABLE: no toca `date` ni ningún dato existente.
-- Asientos previos quedan con entry_time = NULL (orden legacy por id, sin cambios).
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS entry_time text;

COMMENT ON COLUMN public.journal_entries.entry_time IS
  'Hora intradía opcional en formato HH:mm para ordenar asientos del mismo día. NULL = sin especificar (orden legacy por id).';
