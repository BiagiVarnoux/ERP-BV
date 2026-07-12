-- Fix: rename_account_code() referenciaba journal_lines.journal_entry_id, columna
-- que no existe (la FK real es journal_lines.entry_id -> journal_entries.id).
-- Esto rompía cualquier intento de renombrar el código de una cuenta con
-- movimientos en el libro diario ("column journal_entry_id does not exist").

CREATE OR REPLACE FUNCTION rename_account_code(
  p_company_id uuid,
  p_old_id     text,
  p_new_id     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_acc accounts%ROWTYPE;
  v_journal_lines  integer := 0;
  v_aux_ledger     integer := 0;
  v_aux_def        integer := 0;
  v_sale_config    integer := 0;
BEGIN
  -- Verificar que el código viejo existe en esta empresa
  SELECT * INTO v_acc FROM accounts WHERE id = p_old_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta "%" no existe en esta empresa.', p_old_id;
  END IF;

  -- Verificar que el código nuevo no está en uso en esta empresa
  IF EXISTS (SELECT 1 FROM accounts WHERE id = p_new_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'El código "%" ya está en uso en el plan de cuentas.', p_new_id;
  END IF;

  -- Insertar cuenta con el nuevo código (copia exacta del registro original)
  INSERT INTO accounts (
    id, company_id, user_id, name, type, normal_side, is_active,
    expense_category, is_cash_equivalent, is_current,
    clasificacion_resultado, subclasificacion_resultado, clasificacion_flujo,
    es_partida_no_monetaria, es_capital_trabajo, es_financiera,
    es_extraordinaria, afecta_ebitda
  ) VALUES (
    p_new_id, v_acc.company_id, v_acc.user_id, v_acc.name,
    v_acc.type, v_acc.normal_side, v_acc.is_active,
    v_acc.expense_category, v_acc.is_cash_equivalent, v_acc.is_current,
    v_acc.clasificacion_resultado, v_acc.subclasificacion_resultado, v_acc.clasificacion_flujo,
    v_acc.es_partida_no_monetaria, v_acc.es_capital_trabajo, v_acc.es_financiera,
    v_acc.es_extraordinaria, v_acc.afecta_ebitda
  );

  -- Actualizar journal_lines (sin company_id directo: join via journal_entries).
  -- FK real: journal_lines.entry_id -> journal_entries.id (no "journal_entry_id").
  UPDATE journal_lines SET account_id = p_new_id
  WHERE account_id = p_old_id
    AND entry_id IN (
      SELECT id FROM journal_entries WHERE company_id = p_company_id
    );
  GET DIAGNOSTICS v_journal_lines = ROW_COUNT;

  -- Actualizar auxiliary_ledger
  UPDATE auxiliary_ledger SET account_id = p_new_id
  WHERE account_id = p_old_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_aux_ledger = ROW_COUNT;

  -- Actualizar auxiliary_ledger_definitions
  UPDATE auxiliary_ledger_definitions SET account_id = p_new_id
  WHERE account_id = p_old_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_aux_def = ROW_COUNT;

  -- Actualizar company_sale_account_config
  UPDATE company_sale_account_config SET account_codigo = p_new_id
  WHERE account_codigo = p_old_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_sale_config = ROW_COUNT;

  -- Eliminar el código viejo
  DELETE FROM accounts WHERE id = p_old_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'success',       true,
    'old_id',        p_old_id,
    'new_id',        p_new_id,
    'journal_lines', v_journal_lines,
    'aux_ledger',    v_aux_ledger,
    'aux_def',       v_aux_def,
    'sale_config',   v_sale_config
  );
END;
$$;
