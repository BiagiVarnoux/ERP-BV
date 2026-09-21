// src/components/journal/TaxDocFromJournalModal.tsx
// Cuando un asiento del Libro Diario toca una cuenta marcada como Crédito
// Fiscal IVA o Débito Fiscal IVA (Account.modulo_vinculado), este modal aparece
// DESPUÉS de que el asiento ya se guardó y ofrece registrar la factura en el
// libro fiscal correspondiente, enlazada a ese asiento.
//
// El importe de la línea contable ES el IVA, así que el importe facturado se
// deduce dividiendo por la alícuota. El usuario puede corregirlo: si al
// recalcular el IVA ya no coincide con la línea del asiento, se avisa.
//
// Siempre se puede omitir: no todo movimiento de estas cuentas es una factura
// (el IVA de una DUI, el asiento de liquidación mensual del IVA, un ajuste).
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { JournalEntry, ModuloVinculado } from '@/accounting/types';
import { fmt, round2, toDecimal } from '@/accounting/utils';
import {
  ALICUOTA_IVA, TIPO_DOCUMENTO_LABEL, calcularBaseEIva, createTaxDocument,
  formatPeriodo, periodoDeFecha,
  type TaxTipoDocumento,
} from '@/domain/taxes';

export interface TaxLineToProcess {
  lineIndex: number;
  accountId: string;
  accountName: string;
  /** Importe de la línea contable = el IVA del documento. */
  lineAmount: number;
  modulo: Extract<ModuloVinculado, 'credito_fiscal' | 'debito_fiscal'>;
}

interface Props {
  isOpen: boolean;
  linesToProcess: TaxLineToProcess[];
  journalEntry: JournalEntry;
  companyId: string;
  onDone: () => void;
}

export function TaxDocFromJournalModal({ isOpen, linesToProcess, journalEntry, companyId, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const linea = linesToProcess[idx];
  const esCompra = linea?.modulo === 'credito_fiscal';

  const [razonSocial, setRazonSocial]   = useState('');
  const [nit, setNit]                   = useState('');
  const [tipoDocumento, setTipoDoc]     = useState<TaxTipoDocumento>('factura');
  const [numeroFactura, setNumero]      = useState('');
  const [autorizacion, setAutorizacion] = useState('');
  const [importeTotal, setImporteTotal] = useState('');
  const [periodo, setPeriodo]           = useState('');
  const [saving, setSaving]             = useState(false);

  // Al abrir (o al pasar a la siguiente línea) se precarga desde el asiento.
  useEffect(() => {
    if (!isOpen || !linea) return;
    setRazonSocial('');
    setNit('');
    setTipoDoc('factura');
    setNumero('');
    setAutorizacion('');
    // El IVA de la línea "por dentro" implica un importe facturado de iva / 13%.
    setImporteTotal(String(round2(linea.lineAmount / (ALICUOTA_IVA / 100))));
    setPeriodo(periodoDeFecha(journalEntry.date));
  }, [isOpen, idx, linea, journalEntry.date]);

  const calculado = useMemo(
    () => calcularBaseEIva({ importe_total: toDecimal(importeTotal) }),
    [importeTotal],
  );

  // El IVA que resulta del importe capturado debería coincidir con la línea del
  // asiento; si no, el libro y la contabilidad quedarían diciendo cosas distintas.
  const descuadre = linea ? round2(calculado.iva - linea.lineAmount) : 0;

  if (!linea) return null;

  const siguiente = () => {
    if (idx + 1 < linesToProcess.length) setIdx(idx + 1);
    else onDone();
  };

  async function registrar() {
    if (!razonSocial.trim()) {
      toast.error(esCompra ? 'Razón social del proveedor requerida' : 'Razón social del cliente requerida');
      return;
    }
    const total = toDecimal(importeTotal);
    if (!(total > 0)) { toast.error('Importe total inválido'); return; }

    setSaving(true);
    try {
      await createTaxDocument({
        tipo: esCompra ? 'compra' : 'venta',
        fecha: journalEntry.date,
        periodo,
        nit: nit.trim() || null,
        razon_social: razonSocial.trim(),
        tipo_documento: tipoDocumento,
        numero_factura: numeroFactura.trim() || null,
        numero_autorizacion: autorizacion.trim() || null,
        importe_total: total,
        journal_entry_id: journalEntry.id,
      }, companyId);
      toast.success(esCompra ? 'Registrada en el Libro de Compras' : 'Registrada en el Libro de Ventas');
      siguiente();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error registrando la factura';
      // El índice único por asiento es la red de seguridad contra la doble carga.
      toast.error(msg.includes('uq_tax_documents_journal_entry')
        ? 'Este asiento ya tiene una factura registrada en el libro fiscal.'
        : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={o => !o && onDone()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esCompra ? 'Registrar en el Libro de Compras' : 'Registrar en el Libro de Ventas'}
          </DialogTitle>
          <DialogDescription>
            El asiento <span className="font-mono">{journalEntry.id}</span> mueve{' '}
            <span className="font-medium">{linea.accountName}</span> por Bs {fmt(linea.lineAmount)}.
            Completa los datos de la factura para que compute en el{' '}
            {esCompra ? 'crédito' : 'débito'} fiscal del período.
            {linesToProcess.length > 1 && ` (${idx + 1} de ${linesToProcess.length})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>{esCompra ? 'Proveedor (razón social)' : 'Cliente (razón social)'}</Label>
              <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>NIT / CI</Label>
              <Input value={nit} onChange={e => setNit(e.target.value)} className="font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Tipo de documento</Label>
              <Select value={tipoDocumento} onValueChange={v => setTipoDoc(v as TaxTipoDocumento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_DOCUMENTO_LABEL) as TaxTipoDocumento[])
                    .filter(k => esCompra || (k !== 'dui' && k !== 'recibo_alquiler'))
                    .map(k => <SelectItem key={k} value={k}>{TIPO_DOCUMENTO_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nº de factura</Label>
              <Input value={numeroFactura} onChange={e => setNumero(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label>Nº autorización / CUF</Label>
              <Input value={autorizacion} onChange={e => setAutorizacion(e.target.value)} className="font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Importe total (Bs)</Label>
              <Input
                inputMode="decimal"
                value={importeTotal}
                onChange={e => setImporteTotal(e.target.value)}
                className="text-right font-mono"
              />
            </div>
            <div>
              <Label>Período de declaración</Label>
              <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">{formatPeriodo(periodo)}</p>
            </div>
            <div>
              <Label>{esCompra ? 'Crédito fiscal' : 'Débito fiscal'}</Label>
              <div className="h-10 flex items-center font-mono font-semibold">Bs {fmt(calculado.iva)}</div>
            </div>
          </div>

          {Math.abs(descuadre) >= 0.01 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-amber-800 dark:text-amber-200">
                El IVA que resulta de este importe (Bs {fmt(calculado.iva)}) no coincide con la línea del
                asiento (Bs {fmt(linea.lineAmount)}): diferencia de Bs {fmt(Math.abs(descuadre))}. Revisa
                el importe antes de registrar, o corrige el asiento.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={siguiente} disabled={saving}>
            No corresponde, omitir
          </Button>
          <Button onClick={registrar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar en el libro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
