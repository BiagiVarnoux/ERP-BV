-- Agrega 'investments' al enum erp_module. Sin esto, member_permissions no puede
-- tener filas para el módulo (la columna es de tipo erp_module) y
-- default_permissions_for_role() — que recorre enum_range(erp_module) — nunca lo
-- incluye, así que ningún miembro no-owner puede ver el módulo de Inversión.
-- NOTA: ADD VALUE debe ir en su propia migración; el valor nuevo no puede usarse
-- en la misma transacción (el backfill va en la migración siguiente).
ALTER TYPE public.erp_module ADD VALUE IF NOT EXISTS 'investments';
