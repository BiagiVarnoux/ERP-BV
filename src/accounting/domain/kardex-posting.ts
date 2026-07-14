// src/accounting/domain/kardex-posting.ts
// Servicio compartido para registrar movimientos de kárdex asociados a un asiento.
// Lo usan tanto el Libro Diario (cuando una línea toca una cuenta con kárdex, p.ej.
// FaceBank/USDT con CPP) como el módulo de Embarques (pago de un producto en USD).
//
// Encapsula: obtener/crear el kardex_entries de la cuenta, leer los movimientos
// previos, recalcular saldo/costo unitario/saldo valorado (CPP) e insertar el
// nuevo kardex_movements ligado al asiento.

import { supabase } from '@/integrations/supabase/client';
import { getCurrentKardexState } from '@/accounting/kardex-utils';
import type { KardexData } from '@/components/kardex/InlineKardexPopup';

export type { KardexData };

interface PostKardexMovementOpts {
  accountId: string;
  companyId: string;
  userId: string;
  fecha: string;            // YYYY-MM-DD
  journalEntryId: string;   // asiento al que pertenece el movimiento
  data: KardexData;         // { concepto, entrada, salidas, costo_total }
}

/**
 * Inserta un movimiento de kárdex (entrada o salida) recalculando el estado CPP.
 * - entrada: saldo += cantidad, valorado += costo_total, costo_unit = valorado/saldo.
 * - salida:  saldo -= cantidad, costo_unit se mantiene, valorado = saldo × costo_unit.
 */
export async function postKardexMovement(opts: PostKardexMovementOpts): Promise<void> {
  const { accountId, companyId, userId, fecha, journalEntryId, data } = opts;

  // Obtener o crear el kardex_entries de la cuenta (scoped a la empresa)
  const { data: existing, error: selErr } = await supabase
    .from('kardex_entries')
    .select('id')
    .eq('account_id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (selErr) throw selErr;

  let kardexId = existing?.id;
  if (!kardexId) {
    const { data: created, error: createErr } = await supabase
      .from('kardex_entries')
      .insert({ account_id: accountId, user_id: userId, company_id: companyId })
      .select()
      .single();
    if (createErr) throw createErr;
    kardexId = created.id;
  }

  // Borrar el movimiento previo ligado a este mismo asiento (si existe) antes de
  // recalcular e insertar el nuevo. Sin esto, reabrir el popup de kárdex al
  // editar un asiento ya guardado duplica el movimiento (mismo journal_entry_id).
  const { error: delErr } = await supabase
    .from('kardex_movements')
    .delete()
    .eq('kardex_id', kardexId)
    .eq('company_id', companyId)
    .eq('journal_entry_id', journalEntryId);
  if (delErr) throw delErr;

  // Estado CPP actual a partir de todos los movimientos previos
  const { data: allMovements } = await supabase
    .from('kardex_movements')
    .select('*')
    .eq('kardex_id', kardexId)
    .eq('company_id', companyId)
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true });

  const state = getCurrentKardexState(allMovements || []);

  const entrada = Number(data.entrada);
  const salida = Number(data.salidas);
  const costoTotal = Number(data.costo_total);

  let nuevoSaldo = 0;
  let nuevoCostoUnitario = 0;
  let nuevoSaldoValorado = 0;

  if (entrada > 0) {
    nuevoSaldo = state.currentBalance + entrada;
    nuevoSaldoValorado = state.currentValuedBalance + costoTotal;
    nuevoCostoUnitario = nuevoSaldo > 0 ? nuevoSaldoValorado / nuevoSaldo : 0;
  } else if (salida > 0) {
    nuevoSaldo = state.currentBalance - salida;
    nuevoCostoUnitario = state.currentUnitCost;
    nuevoSaldoValorado = nuevoSaldo * nuevoCostoUnitario;
  }

  const { error: movErr } = await supabase
    .from('kardex_movements')
    .insert({
      kardex_id: kardexId,
      user_id: userId,
      company_id: companyId,
      fecha,
      concepto: data.concepto,
      entrada,
      salidas: salida,
      costo_total: costoTotal,
      journal_entry_id: journalEntryId,
      saldo: nuevoSaldo,
      costo_unitario: nuevoCostoUnitario,
      saldo_valorado: nuevoSaldoValorado,
    });
  if (movErr) throw movErr;
}
