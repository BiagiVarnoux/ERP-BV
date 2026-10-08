-- El UNIQUE de products estaba en (user_id, codigo): bug silencioso multiempresa
-- (dos miembros de la misma empresa podrían crear el mismo código, y un restore
-- que cambia el owner colisiona o deja huecos). El scope correcto es company_id.
-- Ver CLAUDE.md, Regla permanente 1 (user_id es solo contexto de autenticación).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_user_id_codigo_key;
ALTER TABLE public.products ADD  CONSTRAINT products_company_id_codigo_key UNIQUE (company_id, codigo);
