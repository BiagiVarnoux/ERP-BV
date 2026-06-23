// src/accounting/domain/embarque-pago.ts
// Registro contable del pago de un producto de embarque comprado en USD vía una
// cuenta con kárdex CPP (FaceBank/USDT). Crea el asiento y la salida de kárdex,
// y permite revertirlos al editar/borrar el producto.
//
// Asiento generado:
//   Debe  A.4.1 (Inventario en Tránsito)   <bs>
//   Haber cuenta_pago (FaceBank/USDT)       <bs>
// + salida de USD en el kárdex de la cuenta de pago (CPP → bs = usd × costo CPP).
//
// El CPP se recalcula al leer (getCurrentKardexState/calculateCPP desde la lista
// ordenada de movimientos), por lo que revertir = borrar el movimiento de kárdex
// y el asiento; los saldos posteriores quedan correctos automáticamente.

import { supabase } from '@/integrations/supabase/client';
import { IDataAdapter } from '@/accounting/data-adapter';
import { JournalEntry } from '@/accounting/types';
import { round2 } from '@/accounting/utils';
import { postKardexMovement, KardexData } from './kardex-posting';

// Cuenta de Inventario en Tránsito (débito del asiento de compra)
export const CUENTA_INVENTARIO_TRANSITO = 'A.4.1';

interface RegistrarPagoOpts {
  adapter: IDataAdapter;
  companyId: string;
  userId: string;
  entryId: string;          // id del asiento (generado por el caller con generateEntryId)
  fecha: string;            // YYYY-MM-DD — fecha de la compra
  cuentaPagoId: string;     // cuenta con kárdex (A.8 FaceBank, A.7 USDT, ...)
  kardex: KardexData;       // salida de USD + costo_total en Bs (del InlineKardexPopup) + concepto
  memo: string;             // glosa del asiento (p.ej. "Compra iPhone 14 — EMB-2026-005")
  transitoAccountId?: string;
}

export interface RegistrarPagoResult {
  journalEntryId: string;
  bsTotal: number;
}

/**
 * Crea el asiento de compra (Debe A.4.1 / Haber cuenta_pago) y la salida de USD
 * en el kárdex de la cuenta de pago. Devuelve el id del asiento y el total en Bs.
 */
export async function registrarPagoProducto(opts: RegistrarPagoOpts): Promise<RegistrarPagoResult> {
  const transito = opts.transitoAccountId ?? CUENTA_INVENTARIO_TRANSITO;
  const bsTotal = round2(Number(opts.kardex.costo_total) || 0);
  if (bsTotal <= 0) throw new Error('El pago no tiene importe en Bs (registra la salida del kárdex)');
  if (!opts.cuentaPagoId) throw new Error('Falta la cuenta de pago');

  const entry: JournalEntry = {
    id: opts.entryId,
    date: opts.fecha,
    memo: opts.memo,
    lines: [
      { account_id: transito,          debit: bsTotal, credit: 0,       line_memo: opts.memo },
      { account_id: opts.cuentaPagoId, debit: 0,       credit: bsTotal, line_memo: opts.memo },
    ],
  };

  await opts.adapter.saveEntry(entry);

  await postKardexMovement({
    accountId: opts.cuentaPagoId,
    companyId: opts.companyId,
    userId: opts.userId,
    fecha: opts.fecha,
    journalEntryId: opts.entryId,
    data: opts.kardex,
  });

  return { journalEntryId: opts.entryId, bsTotal };
}

/**
 * Revierte el pago: borra la salida de kárdex ligada al asiento y luego el asiento.
 * El CPP de los movimientos posteriores se recalcula solo al leer.
 */
export async function revertirPagoProducto(opts: {
  adapter: IDataAdapter;
  companyId: string;
  journalEntryId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('kardex_movements')
    .delete()
    .eq('journal_entry_id', opts.journalEntryId)
    .eq('company_id', opts.companyId);
  if (error) throw error;

  await opts.adapter.deleteEntry(opts.journalEntryId);
}
