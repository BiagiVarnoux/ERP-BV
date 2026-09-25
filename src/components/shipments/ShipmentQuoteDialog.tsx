// src/components/shipments/ShipmentQuoteDialog.tsx
// Genera cotizaciones/proformas de cliente a partir de un embarque cerrado:
// elegís productos, activás/desactivás conceptos de costo por producto
// (precio, flete, GA, IVA, manipuleo, o uno personalizado como "Ganancia"),
// editás sus valores y generás el PDF. Cada cotización queda guardada como
// historial del embarque (tabla `shipment_cotizaciones`).
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, Plus, Trash2, Eye, Download, FileText } from 'lucide-react';
import { Shipment } from '@/accounting/shipment-types';
import { calcCostoFinalPorProducto } from '@/accounting/shipment-utils';
import {
  ShipmentQuote, CotizacionProducto, CotizacionConcepto,
  calcSubtotalProducto, calcTotalGeneral,
} from '@/accounting/shipment-quote-types';
import { ShipmentQuoteStorage } from '@/accounting/shipment-quote-storage';
import { fmt, toDecimal, todayISO } from '@/accounting/utils';
import { exportProformaEmbarqueToPDF, ProformaEmbarquePDFData, previewNextPdf } from '@/services/pdfService';

interface DraftConcepto extends CotizacionConcepto {
  valor_str: string;
}

interface DraftProducto {
  id: string;
  shipment_product_id: string;
  nombre: string;
  especificacion?: string;
  incluido: boolean;
  expanded: boolean;
  cantidad_str: string;
  conceptos: DraftConcepto[];
}

function buildInitialDraft(shipment: Shipment): DraftProducto[] {
  return calcCostoFinalPorProducto(shipment).map(({ product: p, detalle: d }) => ({
    id: crypto.randomUUID(),
    shipment_product_id: p.id,
    nombre: p.nombre,
    especificacion: p.especificacion,
    incluido: false,
    expanded: false,
    cantidad_str: String(p.cantidad),
    conceptos: [
      { id: crypto.randomUUID(), nombre: 'Precio', incluido: true, valor_unitario: d.precioBs, valor_str: String(d.precioBs) },
      { id: crypto.randomUUID(), nombre: 'Flete / Envío', incluido: true, valor_unitario: d.envioUnitario, valor_str: String(d.envioUnitario) },
      { id: crypto.randomUUID(), nombre: 'GA (Gravamen Arancelario)', incluido: true, valor_unitario: d.ga, valor_str: String(d.ga) },
      { id: crypto.randomUUID(), nombre: 'IVA', incluido: true, valor_unitario: d.iva, valor_str: String(d.iva) },
      { id: crypto.randomUUID(), nombre: 'Manipuleo', incluido: true, valor_unitario: d.manipuleo, valor_str: String(d.manipuleo) },
    ],
  }));
}

function resolverProductos(productos: DraftProducto[]): CotizacionProducto[] {
  return productos
    .filter(p => p.incluido)
    .map(p => ({
      id: p.id,
      shipment_product_id: p.shipment_product_id,
      nombre: p.nombre,
      especificacion: p.especificacion,
      cantidad: toDecimal(p.cantidad_str),
      conceptos: p.conceptos.map(c => ({
        id: c.id,
        nombre: c.nombre.trim() || 'Concepto',
        incluido: c.incluido,
        valor_unitario: toDecimal(c.valor_str),
        personalizado: c.personalizado,
      })),
    }));
}

function quoteToPdfData(shipment: Shipment, quote: Pick<ShipmentQuote, 'numero' | 'cliente_nombre' | 'fecha' | 'productos' | 'total_general'>): ProformaEmbarquePDFData {
  return {
    shipment_numero: shipment.numero,
    numero: quote.numero,
    cliente_nombre: quote.cliente_nombre,
    fecha: quote.fecha,
    productos: quote.productos.map(p => ({
      nombre: p.nombre,
      especificacion: p.especificacion,
      cantidad: p.cantidad,
      conceptos: p.conceptos.filter(c => c.incluido).map(c => ({ nombre: c.nombre, valor_unitario: c.valor_unitario })),
      subtotal: calcSubtotalProducto(p),
    })),
    total_general: quote.total_general,
  };
}

export function ShipmentQuoteDialog({ shipment, open, onOpenChange, companyId, canEdit, canDelete }: {
  shipment: Shipment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [view, setView] = useState<'list' | 'new'>('list');
  const [quotes, setQuotes] = useState<ShipmentQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ quote: ShipmentQuote; step: 1 | 2 } | null>(null);

  const [numero, setNumero] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [productos, setProductos] = useState<DraftProducto[]>([]);

  useEffect(() => {
    if (!open) return;
    setView('list');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipment.id]);

  async function load() {
    setLoading(true);
    try {
      setQuotes(await ShipmentQuoteStorage.listByShipment(shipment.id, companyId));
    } catch (e: any) {
      toast.error(e.message || 'Error cargando cotizaciones');
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setProductos(buildInitialDraft(shipment));
    setNumero(`${shipment.numero}-COT-${String(quotes.length + 1).padStart(2, '0')}`);
    setClienteNombre('');
    setFecha(todayISO());
    setView('new');
  }

  function updateProducto(id: string, changes: Partial<DraftProducto>) {
    setProductos(prev => prev.map(p => (p.id === id ? { ...p, ...changes } : p)));
  }
  function updateConcepto(prodId: string, conceptoId: string, changes: Partial<DraftConcepto>) {
    setProductos(prev => prev.map(p => (p.id !== prodId ? p : {
      ...p,
      conceptos: p.conceptos.map(c => (c.id === conceptoId ? { ...c, ...changes } : c)),
    })));
  }
  function addConcepto(prodId: string) {
    setProductos(prev => prev.map(p => (p.id !== prodId ? p : {
      ...p,
      conceptos: [...p.conceptos, {
        id: crypto.randomUUID(), nombre: '', incluido: true, valor_unitario: 0, valor_str: '0', personalizado: true,
      }],
    })));
  }
  function removeConcepto(prodId: string, conceptoId: string) {
    setProductos(prev => prev.map(p => (p.id !== prodId ? p : {
      ...p,
      conceptos: p.conceptos.filter(c => c.id !== conceptoId),
    })));
  }

  const productosResueltos = useMemo(() => resolverProductos(productos), [productos]);
  const totalGeneral = useMemo(() => calcTotalGeneral(productosResueltos), [productosResueltos]);

  // Cuánto de cada producto ya se cotizó en cotizaciones anteriores de este embarque
  // (sin importar qué conceptos tenía activados esa vez) — para avisar antes de
  // cotizarlo de nuevo, no para bloquearlo (a veces se cotiza el mismo producto
  // a más de un cliente).
  const cantidadCotizadaPorProducto = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of quotes) {
      for (const p of q.productos) {
        map[p.shipment_product_id] = (map[p.shipment_product_id] ?? 0) + p.cantidad;
      }
    }
    return map;
  }, [quotes]);

  function emitirPDF(quote: Pick<ShipmentQuote, 'numero' | 'cliente_nombre' | 'fecha' | 'productos' | 'total_general'>, mode: 'view' | 'save') {
    const data = quoteToPdfData(shipment, quote);
    if (mode === 'view') previewNextPdf(() => exportProformaEmbarqueToPDF(data));
    else exportProformaEmbarqueToPDF(data);
  }

  function handlePreview() {
    emitirPDF({
      numero: numero.trim() || 'PREVIEW',
      cliente_nombre: clienteNombre.trim() || undefined,
      fecha,
      productos: productosResueltos,
      total_general: totalGeneral,
    }, 'view');
  }

  async function handleGenerar() {
    if (productosResueltos.length === 0) { toast.error('Seleccioná al menos un producto'); return; }
    if (!numero.trim()) { toast.error('Ingresá un número de cotización'); return; }
    setSaving(true);
    try {
      const quote = await ShipmentQuoteStorage.create({
        shipment_id: shipment.id,
        numero: numero.trim(),
        cliente_nombre: clienteNombre.trim() || undefined,
        fecha,
        productos: productosResueltos,
        total_general: totalGeneral,
      }, companyId);
      emitirPDF(quote, 'save');
      toast.success('Cotización guardada y PDF descargado');
      setView('list');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error al generar la cotización');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.step === 1) { setDeleteConfirm({ ...deleteConfirm, step: 2 }); return; }
    try {
      await ShipmentQuoteStorage.delete(deleteConfirm.quote.id, companyId);
      toast.success('Cotización eliminada');
      setDeleteConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cotizaciones — {shipment.numero}</DialogTitle>
          </DialogHeader>

          {view === 'list' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{quotes.length} cotización(es) generada(s)</p>
                {canEdit && (
                  <Button size="sm" onClick={startNew}>
                    <Plus className="h-4 w-4 mr-1.5" /> Nueva cotización
                  </Button>
                )}
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Cargando...</p>
              ) : quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Todavía no se generó ninguna cotización de este embarque.
                </p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map(q => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium">{q.numero}</TableCell>
                          <TableCell>{q.cliente_nombre || '—'}</TableCell>
                          <TableCell>{q.fecha}</TableCell>
                          <TableCell className="text-right">Bs {fmt(q.total_general)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver PDF" onClick={() => emitirPDF(q, 'view')}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Descargar PDF" onClick={() => emitirPDF(q, 'save')}>
                                <Download className="h-4 w-4" />
                              </Button>
                              {canDelete && (
                                <Button
                                  size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Eliminar" onClick={() => setDeleteConfirm({ quote: q, step: 1 })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Número</Label>
                  <Input value={numero} onChange={e => setNumero(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cliente (opcional)</Label>
                  <Input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {productos.map(p => {
                  const subtotal = calcSubtotalProducto({
                    cantidad: toDecimal(p.cantidad_str),
                    conceptos: p.conceptos.map(c => ({ ...c, valor_unitario: toDecimal(c.valor_str) })),
                  });
                  const yaCotizado = cantidadCotizadaPorProducto[p.shipment_product_id];
                  return (
                    <div
                      key={p.id}
                      className={`border rounded-lg ${yaCotizado ? 'border-l-4 border-l-amber-500' : ''}`}
                    >
                      <div className="flex items-center gap-2 p-2.5">
                        <Checkbox
                          checked={p.incluido}
                          onCheckedChange={(checked) => updateProducto(p.id, { incluido: !!checked, expanded: !!checked })}
                        />
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left disabled:cursor-default"
                          disabled={!p.incluido}
                          onClick={() => updateProducto(p.id, { expanded: !p.expanded })}
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{p.nombre}</p>
                            {yaCotizado > 0 && (
                              <span
                                className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                title="Unidades ya incluidas en cotizaciones anteriores de este embarque"
                              >
                                Ya cotizado: {yaCotizado} u.
                              </span>
                            )}
                          </div>
                          {p.especificacion && <p className="text-xs text-muted-foreground truncate">{p.especificacion}</p>}
                        </button>
                        {p.incluido && (
                          <>
                            <Input
                              type="number" className="h-8 w-20 shrink-0" value={p.cantidad_str}
                              onChange={e => updateProducto(p.id, { cantidad_str: e.target.value })}
                            />
                            <span className="text-sm font-semibold w-24 text-right shrink-0">Bs {fmt(subtotal)}</span>
                            <button type="button" onClick={() => updateProducto(p.id, { expanded: !p.expanded })} className="shrink-0">
                              {p.expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          </>
                        )}
                      </div>
                      {p.incluido && p.expanded && (
                        <div className="border-t p-2.5 space-y-1.5 bg-muted/30">
                          {p.conceptos.map(c => (
                            <div key={c.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={c.incluido}
                                onCheckedChange={(checked) => updateConcepto(p.id, c.id, { incluido: !!checked })}
                              />
                              {c.personalizado ? (
                                <Input
                                  className="h-8 flex-1" placeholder="Nombre del concepto"
                                  value={c.nombre} onChange={e => updateConcepto(p.id, c.id, { nombre: e.target.value })}
                                />
                              ) : (
                                <span className="flex-1 text-sm">{c.nombre}</span>
                              )}
                              <Input
                                type="number" step="0.01" className="h-8 w-28"
                                value={c.valor_str} onChange={e => updateConcepto(p.id, c.id, { valor_str: e.target.value })}
                              />
                              {c.personalizado && (
                                <Button
                                  size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => removeConcepto(p.id, c.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addConcepto(p.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar concepto
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center rounded-lg bg-muted/50 p-3">
                <span className="text-sm font-medium">Total general</span>
                <span className="text-lg font-semibold">Bs {fmt(totalGeneral)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            {view === 'list' ? (
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
                <Button variant="outline" onClick={handlePreview}>
                  <Eye className="h-4 w-4 mr-1.5" /> Vista previa
                </Button>
                <Button onClick={handleGenerar} disabled={saving}>
                  <FileText className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando...' : 'Guardar y descargar PDF'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.step === 2 ? '⚠️ Confirmar eliminación definitiva' : `¿Eliminar cotización ${deleteConfirm?.quote.numero}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.step === 2
                ? 'Esta acción es irreversible. La cotización se eliminará del historial del embarque.'
                : 'Esta acción no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {deleteConfirm?.step === 1 ? (
              <Button onClick={confirmDelete}>Continuar</Button>
            ) : (
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar definitivamente
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
