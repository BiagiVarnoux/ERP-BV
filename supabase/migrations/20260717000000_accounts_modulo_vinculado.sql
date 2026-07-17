-- Marca qué cuenta del plan de cuentas corresponde a Cuentas por Pagar o
-- Cuentas por Cobrar, para que el Libro Diario pueda detectar cuándo un
-- asiento toca una de estas cuentas y ofrecer registrar/vincular el CxP/CxC
-- correspondiente (igual idea que auxiliary_ledger_definitions, pero como
-- propiedad de la cuenta en vez de tabla aparte — una cuenta puede ser CxP
-- o CxC pero no ambas).

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS modulo_vinculado text
    CHECK (modulo_vinculado IN ('cxp', 'cxc'));

-- Sembrar como CxP las cuentas que Payables ya usa hoy como cuenta_pasivo_id —
-- dato real de uso, no adivinado. No hay siembra equivalente para CxC porque
-- receivables no tenía cuenta vinculada hasta esta misma migración (ver
-- 20260717000001_receivables_journal_link.sql).
UPDATE public.accounts a
SET modulo_vinculado = 'cxp'
WHERE modulo_vinculado IS NULL
  AND EXISTS (
    SELECT 1 FROM public.payables p
    WHERE p.cuenta_pasivo_id = a.id
      AND p.company_id = a.company_id
  );
