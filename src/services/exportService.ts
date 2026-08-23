// src/services/exportService.ts
import { JournalEntry } from '@/accounting/types';
import { downloadBlob } from '@/lib/open-url';

export interface ExportColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => string | number);
}

/**
 * Generate CSV content from columns and data
 */
export function generateCSV<T>(columns: ExportColumn<T>[], data: T[]): string {
  const headers = columns.map(col => col.header);
  const rows = data.map(row => 
    columns.map(col => {
      const value = typeof col.accessor === 'function' 
        ? col.accessor(row) 
        : row[col.accessor];
      return value ?? '';
    })
  );
  
  const allRows = [headers, ...rows];
  return allRows.map(r => 
    r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Download CSV content as a file
 */
export function downloadCSV(content: string, filename: string): void {
  // BOM para que Excel abra bien los acentos; descarga robusta también en PWA iOS.
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * Export journal entries to CSV
 */
export function exportJournalToCSV(entries: JournalEntry[]): void {
  const rows: string[][] = [['ID', 'Fecha', 'Glosa', 'Cuenta', 'Debe', 'Haber', 'Glosa línea']];
  
  for (const e of entries) {
    for (const l of e.lines) {
      rows.push([
        e.id,
        e.date,
        e.memo || '',
        l.account_id,
        String(l.debit),
        String(l.credit),
        l.line_memo || ''
      ]);
    }
  }
  
  const csv = rows.map(r => 
    r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadCSV(csv, 'libro_diario.csv');
}

export interface LedgerRow {
  date: string;
  id: string;
  memo: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Export ledger to CSV
 */
export function exportLedgerToCSV(
  rows: LedgerRow[],
  account: string,
  quarter: string,
  opening: number,
  closing: number
): void {
  const csvRows: string[][] = [
    ['Cuenta', 'Trimestre'],
    [account, quarter],
    ['Fecha', 'Asiento', 'Glosa', 'Debe', 'Haber', 'Saldo'],
    ['', '', '', '', '', ''],
    ['Saldo Inicial', '', '', '', '', String(opening)]
  ];
  
  for (const r of rows) {
    csvRows.push([
      r.date,
      r.id,
      r.memo,
      String(r.debit),
      String(r.credit),
      String(r.balance)
    ]);
  }
  
  csvRows.push(['', '', '', '', '', '']);
  csvRows.push(['Saldo Final', '', '', '', '', String(closing)]);
  
  const csv = csvRows.map(r => 
    r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadCSV(csv, 'libro_mayor.csv');
}

export interface TrialBalanceRow {
  id: string;
  name: string;
  debit: number;
  credit: number;
  side: string;
}

/**
 * Export trial balance to CSV
 */
export function exportTrialBalanceToCSV(
  rows: TrialBalanceRow[],
  totals: { debit: number; credit: number }
): void {
  const csvRows: string[][] = [
    ['Código', 'Cuenta', 'Debe', 'Haber', 'Saldo']
  ];
  
  for (const r of rows) {
    const saldo = r.side === 'DEBE' ? (r.debit - r.credit) : (r.credit - r.debit);
    csvRows.push([
      r.id,
      r.name,
      r.debit ? String(r.debit) : '',
      r.credit ? String(r.credit) : '',
      String(saldo)
    ]);
  }
  
  csvRows.push([
    'Totales',
    '',
    String(totals.debit),
    String(totals.credit),
    String(totals.debit - totals.credit)
  ]);
  
  const csv = csvRows.map(r => 
    r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadCSV(csv, 'balance_comprobacion.csv');
}
