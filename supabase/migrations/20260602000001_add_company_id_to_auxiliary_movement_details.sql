-- ================================================================
-- Migration: Add company_id to auxiliary_movement_details
-- File: 20260602000001_add_company_id_to_auxiliary_movement_details.sql
-- Date: 2026-06-02
--
-- The table was created without company_id but data-adapter.ts
-- inserts with company_id: DEFAULT_COMPANY_ID, causing:
--   "Could not find the 'company_id' column of
--    'auxiliary_movement_details' in the schema cache"
-- ================================================================

ALTER TABLE public.auxiliary_movement_details
  ADD COLUMN IF NOT EXISTS company_id uuid
    NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES public.companies(id);

-- Back-fill any existing rows (DEFAULT handles new rows automatically)
UPDATE public.auxiliary_movement_details
   SET company_id = '00000000-0000-0000-0000-000000000001'
 WHERE company_id IS NULL;

-- Index for company-scoped queries (consistent with other tables)
CREATE INDEX IF NOT EXISTS idx_aux_movement_details_company
  ON public.auxiliary_movement_details(company_id);
