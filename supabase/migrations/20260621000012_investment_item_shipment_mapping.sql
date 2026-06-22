-- Mapeo producto del análisis → fila(s) del embarque vinculado (Fase 1 de la
-- conciliación análisis ↔ embarque). Guarda los IDs de los productos del
-- embarque (que viven en el JSONB del shipment) que corresponden a este ítem.
-- Uno-a-varios: ej. MacBook Neo del análisis → Blanco + Azul del embarque.
-- El embarque vinculado es uno solo, identificado por investment_analyses.embarque_id.
ALTER TABLE public.investment_analysis_items
  ADD COLUMN IF NOT EXISTS mapped_shipment_product_ids text[] NOT NULL DEFAULT '{}';
