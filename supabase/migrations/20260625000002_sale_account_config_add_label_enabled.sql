ALTER TABLE public.company_sale_account_config
  ADD COLUMN IF NOT EXISTS label      text,
  ADD COLUMN IF NOT EXISTS enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom  boolean NOT NULL DEFAULT false;
