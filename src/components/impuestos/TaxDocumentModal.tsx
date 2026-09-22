import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { fmt, round2, toDecimal, todayISO } from '@/accounting/utils';
import {
  ALICUOTA_IVA, ALICUOTA_IVA_IMPORTACION, DIM_NUMERO_AUTORIZACION, DIM_NUMERO_FACTURA,
  TIPO_DOCUMENTO_LABEL, adjuntarArchivoAFactura, buscarDuplicados,
  calcularBaseEIva, createTaxDocument, formatPeriodo, periodoDeFecha,
  urlFirmadaFactura, updateTaxDocument,
  type FacturaExtraida, type TaxDocTipo, type TaxDocumentRow, type TaxTipoDocumento,
} from '@/domain/taxes';
import { FacturaUploader } from './FacturaUploader';
import { openExternalUrl } from '@/lib/open-url';

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
  /** IVA tomado del documento (DIM); '' = se calcula desde la base. */
  iva_manual: string;
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
    iva_manual: '',
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
    iva_manual: r.usa_iva_manual ? String(r.iva) : '',
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
  const [archivo, setArchivo] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editRow ? fromRow(editRow) : emptyForm(periodoActual));
    setDuplicados([]);
    setArchivo(null);
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

  /**
   * Vuelca en el formulario lo que la IA leyó. Solo se pisan los campos que el
   * modelo devolvió con valor: lo que ya escribió el usuario no se pierde.
   */
  function aplicarLectura(d: FacturaExtraida) {
    // Una DIM no es una factura: el IVA lo liquidó la Aduana "por fuera" sobre
    // CIF + GA, así que se toma el importe impreso en vez de recalcularlo.
    if (d.es_dim) {
      const cif = d.valor_cif_bob ?? 0;
      const ga  = d.gravamen_arancelario ?? 0;
      setForm(prev => ({
        ...prev,
        tipo_documento: 'dui',
        // En el Libro de Compras la DIM se registra a nombre del DECLARANTE
        // (la agencia despachante), no del proveedor del exterior.
        razon_social: d.razon_social ?? prev.razon_social,
        nit: d.nit ?? prev.nit,
        // Una DIM no tiene número de factura ni autorización propios: van 0 y 3.
        numero_factura: DIM_NUMERO_FACTURA,
        numero_autorizacion: DIM_NUMERO_AUTORIZACION,
        codigo_control: '',
        fecha: d.fecha ?? prev.fecha,
        periodo: d.fecha ? periodoDeFecha(d.fecha) : prev.periodo,
        importe_total: cif || ga ? String(round2(cif + ga)) : prev.importe_total,
        importe_ice: '',
        importe_exento: '',
        descuentos: '',
        alicuota: String(ALICUOTA_IVA_IMPORTACION),
        iva_manual: d.iva_pagado != null ? String(d.iva_pagado) : prev.iva_manual,
        con_derecho_credito: true,
        // El N° de declaración no tiene campo propio en el libro; se guarda en
        // notas para no perder la referencia a la DIM.
        notas: d.numero_declaracion ? `DIM ${d.numero_declaracion}` : prev.notas,
      }));
      return;
    }

    setForm(prev => {
      const next = { ...prev };
      if (d.razon_social)        next.razon_social = d.razon_social;
      if (d.nit)                 next.nit = d.nit;
      if (d.numero_factura)      next.numero_factura = d.numero_factura;
      if (d.numero_autorizacion) next.numero_autorizacion = d.numero_autorizacion;
      if (d.codigo_control)      next.codigo_control = d.codigo_control;
      if (d.fecha) {
        next.fecha = d.fecha;
        // El período sigue a la fecha salvo que el usuario ya lo haya movido.
        if (prev.periodo === periodoDeFecha(prev.fecha)) next.periodo = periodoDeFecha(d.fecha);
      }
      if (d.importe_total != null) next.importe_total = String(d.importe_total);
      next.descuentos     = d.descuentos ? String(d.descuentos) : '';
      next.importe_ice    = d.importe_ice ? String(d.importe_ice) : '';
      // Cuando la factura trae "IMPORTE BASE CRÉDITO FISCAL", la diferencia
      // contra el total es justamente lo que no da crédito: se carga como exento.
      if (d.importe_base_credito_fiscal != null && d.importe_total != null) {
        const noComputable = round2(
          d.importe_total - d.importe_base_credito_fiscal - (d.descuentos ?? 0) - (d.importe_ice ?? 0),
        );
        next.importe_exento = noComputable > 0 ? String(noComputable) : '';
      } else {
        next.importe_exento = d.importe_exento ? String(d.importe_exento) : '';
      }
      if (esCompra && d.con_derecho_credito != null) next.con_derecho_credito = d.con_derecho_credito;
      return next;
    });
  }

  async function verAdjunto() {
    if (!editRow?.archivo_path) return;
    try {
      openExternalUrl(await urlFirmadaFactura(editRow.archivo_path));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el archivo');
    }
  }

  const usaIvaManual = form.iva_manual.trim() !== '';

  const calculado = useMemo(() => calcularBaseEIva({
    importe_total:  toDecimal(form.importe_total),
    importe_ice:    toDecimal(form.importe_ice),
    importe_exento: toDecimal(form.importe_exento),
    descuentos:     toDecimal(form.descuentos),
    alicuota:       toDecimal(form.alicuota) || ALICUOTA_IVA,
    iva_manual:     usaIvaManual ? toDecimal(form.iva_manual) : null,
  }), [form.importe_total, form.importe_ice, form.importe_exento, form.descuentos,
       form.alicuota, form.iva_manual, usaIvaManual]);

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
        iva_manual: usaIvaManual ? toDecimal(form.iva_manual) : null,
        con_derecho_credito: esCompra ? form.con_derecho_credito : true,
        notas: form.notas.trim() || null,
      };
      const guardado = editRow
        ? await updateTaxDocument(editRow.id, payload, companyId)
        : await createTaxDocument(payload, companyId);

      // El adjunto se sube después: su ruta en el bucket lleva el id del documento.
      if (archivo) {
        try {
          await adjuntarArchivoAFactura(archivo, companyId, guardado.id);
        } catch (e: unknown) {
          // La factura ya quedó registrada; solo falló el archivo.
          toast.error(e instanceof Error ? e.message : 'La factura se registró, pero no se pudo adjuntar el archivo');
        }
      }

      toast.success(editRow
        ? 'Documento actualizado'
        : esCompra ? 'Factura registrada en el Libro de Compras' : 'Factura registrada en el Libro de Ventas');
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
          {/* Archivo de la factura + lectura asistida */}
          <FacturaUploader
            tipo={tipo}
            file={archivo}
            onFileChange={setArchivo}
            onExtraido={aplicarLectura}
            archivoExistente={editRow?.archivo_nombre ?? null}
            disabled={saving}
          />

          {editRow?.archivo_path && !archivo && (
            <Button type="button" variant="outline" size="sm" onClick={verAdjunto}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Ver factura adjunta
            </Button>
          )}

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
                {usaIvaManual && <span className="ml-1 opacity-70">(del documento)</span>}
              </div>
              {usaIvaManual ? (
                <Input
                  inputMode="decimal"
                  value={form.iva_manual}
                  onChange={e => set('iva_manual', e.target.value)}
                  className="h-7 text-right font-mono font-semibold"
                />
              ) : (
                <div className="font-mono font-semibold">Bs {fmt(calculado.iva)}</div>
              )}
            </div>
          </div>

          {/* En importaciones el IVA no se deriva de la base: lo liquida la Aduana. */}
          {form.tipo_documento === 'dui' && (
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <Label>Usar el IVA liquidado en la DIM</Label>
                <p className="text-xs text-muted-foreground">
                  En importaciones el IVA va «por fuera» ({fmt(ALICUOTA_IVA_IMPORTACION)}% sobre CIF + GA),
                  así que el crédito fiscal es el importe impreso en la DIM, no uno recalculado.
                </p>
              </div>
              <Switch
                checked={usaIvaManual}
                onCheckedChange={v => set('iva_manual', v ? String(calculado.iva) : '')}
              />
            </div>
          )}

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
