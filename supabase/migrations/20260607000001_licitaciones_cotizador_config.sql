-- Agrega config_value a company_module_config para soportar configuraciones de tipo string
-- (no solo boolean is_visible). Usado por el dispatcher de cotizadores en licitaciones.

ALTER TABLE company_module_config
  ADD COLUMN IF NOT EXISTS config_value text DEFAULT NULL;

-- Actualizar el RPC get_company_module_config para que devuelva config_value
CREATE OR REPLACE FUNCTION get_company_module_config(p_company_id uuid)
RETURNS TABLE (submodule text, is_visible boolean, config_value text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT submodule, is_visible, config_value
  FROM   company_module_config
  WHERE  company_id = p_company_id;
$$;

-- Insertar config por defecto: BV usa cotizador de importación
INSERT INTO company_module_config (company_id, submodule, is_visible, config_value)
SELECT id, 'licitaciones.cotizador_type', true, 'importacion'
FROM   companies
ON CONFLICT (company_id, submodule) DO NOTHING;
