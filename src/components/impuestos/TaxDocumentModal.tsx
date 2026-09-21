import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fmt, toDecimal, todayISO } from '@/accounting/utils';
import {
  ALICUOTA_IVA, TIPO_DOCUMENTO_LABEL, buscarDuplicados, calcularBaseEIva,
  createTaxDocument, formatPeriodo, periodoDeFecha, updateTaxDocument,
  type TaxDocTipo, type TaxDocumentRow, type TaxTipoDocumento,
} from '@/domain/taxes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TaxDocTipo;
  companyId: string;
  /** Fila a editar; null = alta nueva. */
  editRow: TaxDocumentRow | null;
  /** Período preseleccionado en el libro, para que el alta caiga donde el usuario está mirando. */
  periodoActual: string;
  onSaved: () => void;
}

interface FormState {
  fecha: string;
  periodo: string;
  nit: string;
  razon_social: string;
  tipo_documento: TaxTipoDocumento;
  numero_factura: string;
  numero_autorizacion: string;
  codigo_control: string;
  importe_total: string;
  importe_ice: string;
  importe_exento: string;
  descuentos: string;
  alicuota: string;
  con_derecho_credito: boolean;
  notas: string;
}

function emptyForm(periodo: string): FormState {
  const fecha = todayISO();
  return {
    fecha: periodoDeFecha(fecha) === periodo ? fecha : `${periodo}-01`,
    periodo,
    nit: '',
    razon_social: '',
    tipo_documento: 'factura',
    numero_factura: '',
    numero_autorizacion: '',
    codigo_control: '',
    importe_total: '',
    importe_ice: '',
    importe_exento: '',
    descuentos: '',
    alicuota: String(ALICUOTA_IVA),
    con_derecho_credito: true,
    notas: '',
  };
}

function fromRow(r: TaxDocumentRow): FormState {
  return {
    fecha: r.fecha,
    periodo: r.periodo,
    nit: r.nit ?? '',
    razon_social: r.razon_social,
    tipo_documento: r.tipo_documento,
    numero_factura: r.numero_factura ?? '',
    numero_autorizacion: r.numero_autorizacion ?? '',
    codigo_control: r.codigo_control ?? '',
    importe_total: String(r.importe_total),
    importe_ice: r.importe_ice ? String(r.importe_ice) : '',
    importe_exento: r.importe_exento ? String(r.importe_exento) : '',
    descuentos: r.descuentos ? String(r.descuentos) : '',
    alicuota: String(r.alicuota),
    con_derecho_credito: r.con_derecho_credito,
    notas: r.notas ?? '',
  };
}

export function TaxDocumentModal({
  open, onOpenChange, tipo, companyId, editRow, periodoActual, onSaved,
}: Props) {
  const esCompra = tipo === 'compra';
  const [form, setForm] = useState<FormState>(() => emptyForm(periodoActual));
  const [saving, setSaving] = useState(false);
  const [duplicados, setDuplicados] = useState<TaxDocumentRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(editRow ? fromRow(editRow) : emptyForm(periodoActual));
    setDuplicados([]);
  }, [open, editRow, periodoActual]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // La fecha manda sobre el período salvo que el usuario lo haya cambiado a mano.
  const onFechaChange = (fecha: string) => {
    setForm(prev => ({
      ...prev,
      fecha,
      periodo: prev.periodo === periodoDeFecha(prev.fecha) ? periodoDeFecha(fecha) : prev.periodo,
    }));
  };

  const calculado = useMemo(() => calcularBaseEIva({
    importe_total:  toDecimal(form.importe_total),
    importe_ice:    toDecimal(form.importe_ice),
    importe_exento: toDecimal(form.importe_exento),
    descuentos:     toDecimal(form.descuentos),
    alicuota:       toDecimal(form.alicuota) || ALICUOTA_IVA,
  }), [form.importe_total, form.importe_ice, form.importe_exento, form.descuentos, form.alicuota]);

  // Aviso de factura duplicada: el SIN rechaza el crédito fiscal declarado dos veces.
  useEffect(() => {
    if (!open || !companyId) return;
    const numero = form.numero_factura.trim();
    if (!numero) { setDuplicados([]); return; }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const dups = await buscarDuplicados(companyId, tipo, form.nit.trim() || null, numero, editRow?.id);
        if (!cancelado) setDuplicados(dups);
      } catch {
        if (!cancelado) setDuplicados([]);
      }
    }, 400);
    return () => { cancelado = true; clearTimeout(t); };
  }, [open, companyId, tipo, form.numero_factura, form.nit, editRow?.id]);

  async function submit() {
    if (!form.razon_social.trim()) {
      toast.error(esCompra ? 'Razón social del proveedor requerida' : 'Razón social del cliente requerida');
      return;
    }
    const total = toDecimal(form.importe_total);
    if (!(total > 0)) { toast.error('Importe total inválido'); return; }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.periodo)) { toast.error('Período inválido (YYYY-MM)'); return; }

    setSaving(true);
    try {
      const payload = {
        tipo,
        fecha: form.fecha,
        periodo: form.periodo,
        nit: form.nit.trim() || null,
        razon_social: form.razon_social.trim(),
        tipo_documento: form.tipo_documento,
        numero_factura: form.numero_factura.trim() || null,
        numero_autorizacion: form.numero_autorizacion.trim() || null,
        codigo_control: form.codigo_control.trim() || null,
        importe_total: total,
        importe_ice: toDecimal(form.importe_ice),
        importe_exento: toDecimal(form.importe_exento),
        descuentos: toDecimal(form.descuentos),
        alicuota: toDecimal(form.alicuota) || ALICUOTA_IVA,
        con_derecho_credito: esCompra ? form.con_derecho_credito : true,
        notas: form.notas.trim() || null,
      };
      if (editRow) {
        await updateTaxDocument(editRow.id, payload, companyId);
        toast.success('Documento actualizado');
      } else {
        await createTaxDocument(payload, companyId);
        toast.success(esCompra ? 'Factura registrada en el Libro de Compras' : 'Factura registrada en el Libro de Ventas');
      }
      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error guardando el documento');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editRow ? 'Editar documento fiscal' : esCompra ? 'Nueva factura de compra' : 'Nueva factura de venta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contraparte */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>{esCompra ? 'Proveedor (razón social)' : 'Cliente (razón social)'}</Label>
              <Input value={form.razon_social} onChange={e => set('razon_social', e.target.value)} />
            </div>
            <div>
              <Label>NIT / CI</Label>
              <Input value={form.nit} onChange={e => set('nit', e.target.value)} className="font-mono" />
            </div>
          </div>

          {/* Documento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Tipo de documento</Label>
              <Select value={form.tipo_documento} onValueChange={v => set('tipo_documento', v as TaxTipoDocumento)}>
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
              <Input value={form.numero_factura} onChange={e => set('numero_factura', e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label>Nº autorización / CUF</Label>
              <Input value={form.numero_autorizacion} onChange={e => set('numero_autorizacion', e.target.value)} className="font-mono" />
            </div>
          </div>

          {duplicados.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Ya hay {duplicados.length === 1 ? 'un documento' : `${duplicados.length} documentos`} con este Nº de factura y NIT.
                </p>
                <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                  {duplicados.map(d => `${d.fecha} · Bs ${fmt(d.importe_total)}`).join(' · ')}
                  {esCompra && ' — declarar dos veces la misma factura hace que el SIN rechace el crédito fiscal.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Fecha de emisión</Label>
              <Input type="date" value={form.fecha} onChange={e => onFechaChange(e.target.value)} />
            </div>
            <div>
              <Label>Período de declaración</Label>
              <Input type="month" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">{formatPeriodo(form.periodo)}</p>
            </div>
            <div>
              <Label>Código de control</Label>
              <Input value={form.codigo_control} onChange={e => set('codigo_control', e.target.value)} className="font-mono" />
            </div>
          </div>

          {/* Importes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Importe total (Bs)</Label>
              <Input inputMode="decimal" value={form.importe_total} onChange={e => set('importe_total', e.target.value)} className="text-right font-mono" />
            </div>
            <div>
              <Label>ICE / IEHD</Label>
              <Input inputMode="decimal" value={form.importe_ice} onChange={e => set('importe_ice', e.target.value)} className="text-right font-mono" placeholder="0,00" />
            </div>
            <div>
              <Label>Exento</Label>
              <Input inputMode="decimal" value={form.importe_exento} onChange={e => set('importe_exento', e.target.value)} className="text-right font-mono" placeholder="0,00" />
            </div>
            <div>
              <Label>Descuentos</Label>
              <Input inputMode="decimal" value={form.descuentos} onChange={e => set('descuentos', e.target.value)} className="text-right font-mono" placeholder="0,00" />
            </div>
          </div>

          {/* Derivados */}
          <div className="rounded-md border bg-muted/40 p-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Base imponible</div>
              <div className="font-mono font-medium">Bs {fmt(calculado.base_imponible)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Alícuota</div>
              <Input
                inputMode="decimal"
                value={form.alicuota}
                onChange={e => set('alicuota', e.target.value)}
                className="h-7 text-right font-mono"
              />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">
                {esCompra ? 'Crédito fiscal' : 'Débito fiscal'}
              </div>
              <div className="font-mono font-semibold">Bs {fmt(calculado.iva)}</div>
            </div>
          </div>

          {esCompra && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Da derecho a crédito fiscal</Label>
                <p className="text-xs text-muted-foreground">
                  Desactívalo si la compra no está vinculada a la actividad gravada o no tiene respaldo válido.
                  Queda registrada en el libro pero no computa.
                </p>
              </div>
              <Switch checked={form.con_derecho_credito} onCheckedChange={v => set('con_derecho_credito', v)} />
            </div>
          )}

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editRow ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
