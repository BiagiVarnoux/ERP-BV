import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fmt } from '@/accounting/utils';
import {
  createTaxDocuments, formatPeriodo, listCxPPendientes, listVentasPendientes,
  marcarCxPSinCreditoFiscal,
  type CreateTaxDocumentInput, type TaxDocTipo,
} from '@/domain/taxes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TaxDocTipo;
  companyId: string;
  periodo: string;
  onImported: () => void;
}

/** Fila candidata, normalizada para que la tabla sirva a ventas y a CxP. */
interface Candidata {
  origenId: string;
  fecha: string;
  contraparte: string;
  importe: number;
  moneda: string;
  journalEntryId: string | null;
  /** Campos editables antes de mandar al libro. */
  nit: string;
  numero_factura: string;
  numero_autorizacion: string;
}

export function ImportarDialog({ open, onOpenChange, tipo, companyId, periodo, onImported }: Props) {
  const esCompra = tipo === 'compra';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Candidata[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelado = false;
    (async () => {
      setLoading(true);
      setSel(new Set());
      try {
        const candidatas: Candidata[] = esCompra
          ? (await listCxPPendientes(companyId, periodo)).map(p => ({
              origenId: p.id,
              fecha: p.fecha_emision,
              contraparte: p.proveedor_nombre,
              importe: p.monto_original,
              moneda: p.moneda,
              journalEntryId: p.journal_entry_id,
              nit: p.proveedor_nit ?? '',
              numero_factura: p.numero_documento ?? '',
              numero_autorizacion: '',
            }))
          : (await listVentasPendientes(companyId, periodo)).map(v => ({
              origenId: v.id,
              fecha: v.fecha,
              contraparte: v.cliente_nombre ?? 'Sin cliente',
              importe: v.total_cobrado,
              moneda: 'BOB',
              journalEntryId: v.journal_entry_id,
              nit: '',
              numero_factura: '',
              numero_autorizacion: '',
            }));
        if (!cancelado) setRows(candidatas);
      } catch (e: unknown) {
        if (!cancelado) toast.error(e instanceof Error ? e.message : 'Error cargando candidatas');
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [open, companyId, periodo, esCompra]);

  const patch = (origenId: string, campo: keyof Candidata, valor: string) =>
    setRows(prev => prev.map(r => (r.origenId === origenId ? { ...r, [campo]: valor } : r)));

  const toggle = (origenId: string) =>
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(origenId)) next.delete(origenId); else next.add(origenId);
      return next;
    });

  const toggleTodas = () =>
    setSel(prev => (prev.size === rows.length ? new Set() : new Set(rows.map(r => r.origenId))));

  const seleccionadas = useMemo(() => rows.filter(r => sel.has(r.origenId)), [rows, sel]);
  const totalSeleccionado = useMemo(
    () => seleccionadas.reduce((s, r) => s + r.importe, 0),
    [seleccionadas],
  );
  const hayMonedaExtranjera = seleccionadas.some(r => r.moneda !== 'BOB');

  /** Saca una CxP de la lista de candidatas: no es una factura con crédito fiscal. */
  async function descartar(origenId: string) {
    try {
      await marcarCxPSinCreditoFiscal(origenId, companyId, true);
      setRows(prev => prev.filter(r => r.origenId !== origenId));
      setSel(prev => { const n = new Set(prev); n.delete(origenId); return n; });
      toast.success('Descartada: no volverá a aparecer como candidata');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar');
    }
  }

  async function importar() {
    if (seleccionadas.length === 0) { toast.error('Selecciona al menos un documento'); return; }
    if (hayMonedaExtranjera) {
      toast.error('Hay documentos en moneda extranjera: regístralos a mano con el importe en Bs');
      return;
    }
    setSaving(true);
    try {
      const inputs: CreateTaxDocumentInput[] = seleccionadas.map(r => ({
        tipo,
        fecha: r.fecha,
        periodo,
        nit: r.nit.trim() || null,
        razon_social: r.contraparte,
        tipo_documento: 'factura',
        numero_factura: r.numero_factura.trim() || null,
        numero_autorizacion: r.numero_autorizacion.trim() || null,
        importe_total: r.importe,
        journal_entry_id: r.journalEntryId,
        ...(esCompra ? { payable_id: r.origenId } : { sale_id: r.origenId }),
      }));
      await createTaxDocuments(inputs, companyId);
      toast.success(`${inputs.length} ${inputs.length === 1 ? 'documento importado' : 'documentos importados'}`);
      onOpenChange(false);
      onImported();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error importando');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esCompra ? 'Importar desde Cuentas por Pagar' : 'Importar desde Ventas'}
          </DialogTitle>
          <DialogDescription>
            {esCompra
              ? `CxP de ${formatPeriodo(periodo)} que aún no están en el libro. Marca solo las que son facturas con crédito fiscal y completa el Nº de autorización.`
              : `Ventas con factura de ${formatPeriodo(periodo)} que aún no están en el libro. Completa el Nº de factura y autorización de cada una.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No hay documentos pendientes de {formatPeriodo(periodo)}.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sel.size === rows.length && rows.length > 0}
                      onCheckedChange={toggleTodas}
                      aria-label="Seleccionar todas"
                    />
                  </TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>{esCompra ? 'Proveedor' : 'Cliente'}</TableHead>
                  <TableHead className="w-32">NIT</TableHead>
                  <TableHead className="w-32">Nº factura</TableHead>
                  <TableHead className="w-36">Nº autorización</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  {esCompra && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.origenId}>
                    <TableCell>
                      <Checkbox
                        checked={sel.has(r.origenId)}
                        onCheckedChange={() => toggle(r.origenId)}
                        aria-label={`Seleccionar ${r.contraparte}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.fecha}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={r.contraparte}>{r.contraparte}</TableCell>
                    <TableCell>
                      <Input className="h-8 font-mono text-xs" value={r.nit}
                             onChange={e => patch(r.origenId, 'nit', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 font-mono text-xs" value={r.numero_factura}
                             onChange={e => patch(r.origenId, 'numero_factura', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 font-mono text-xs" value={r.numero_autorizacion}
                             onChange={e => patch(r.origenId, 'numero_autorizacion', e.target.value)} />
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {r.moneda !== 'BOB' && <span className="text-[10px] mr-1 text-amber-600">{r.moneda}</span>}
                      {fmt(r.importe)}
                    </TableCell>
                    {esCompra && (
                      <TableCell>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          title="No es factura con crédito fiscal — descartar"
                          onClick={() => descartar(r.origenId)}
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {hayMonedaExtranjera && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-amber-800 dark:text-amber-200">
              Seleccionaste documentos en moneda extranjera. El libro fiscal se lleva en Bs:
              regístralos a mano con el importe convertido al tipo de cambio de la factura.
            </span>
          </div>
        )}

        <DialogFooter className="items-center">
          {seleccionadas.length > 0 && (
            <span className="text-sm text-muted-foreground mr-auto">
              {seleccionadas.length} seleccionados · Bs {fmt(totalSeleccionado)}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={importar} disabled={saving || seleccionadas.length === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Importar al libro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
