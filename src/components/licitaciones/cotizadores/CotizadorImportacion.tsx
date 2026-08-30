// src/components/licitaciones/cotizadores/CotizadorImportacion.tsx
// Cotizador específico para licitaciones de importación (BV).
// Calcula costos USD→Bs, GA, IVA aduanera, flete, manipuleo y contribución neta.

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Trash2, Copy, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, TrendingUp, TrendingDown, Download, Weight, Box, GripVertical, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Licitacion, LicitacionProducto } from '@/accounting/licitacion-types';
import { calcProducto, calcResumen, emptyProducto, TC_OFICIAL, FLETE_CIF_PCT_AEREO, FLETE_CIF_PCT_MARITIMO } from '@/accounting/licitacion-utils';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { fmt, round2 } from '@/accounting/utils';
import { toDecimal } from '@/accounting/utils';
import { exportCotizacionToPDF, previewNextPdf } from '@/services/pdfService';
import { ShareButton } from '@/components/shared/ShareButton';
import { useShareTarget } from '@/hooks/useShareTarget';
import { FormSection } from '@/components/shared/FormSection';
import { ManualOverride } from '@/components/shared/ManualOverride';
import { TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function NumInput({
  value, onChange, className = '', min, max, step = '0.01', placeholder = '0',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      // Teclado numérico en celular; alto mayor en móvil para que sea táctil.
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      className={`h-9 sm:h-7 text-xs px-1.5 text-right ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value;
        onChange(raw === '' ? undefined : toDecimal(raw));
      }}
    />
  );
}

function Pct({ v, decimals = 1 }: { v: number; decimals?: number }) {
  return <span>{(v * 100).toFixed(decimals)}%</span>;
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function CotizadorImportacion({ licitacion, onUpdated }: Props) {
  const companyId = useActiveCompanyId();
  const [productos, setProductos] = useState<LicitacionProducto[]>(licitacion.productos);
  const [tcOficial, setTcOficial] = useState<number>(licitacion.tc_oficial ?? TC_OFICIAL);
  const [fleteCifPct, setFleteCifPct] = useState<number>(licitacion.flete_cif_pct ?? FLETE_CIF_PCT_AEREO);
  // T/C de compra y envío a nivel de licitación: se aplican en bloque a todos los productos.
  const [headerTcCompra, setHeaderTcCompra] = useState<number>(licitacion.productos[0]?.tc ?? 9.97);
  const [headerTcEnvio, setHeaderTcEnvio]   = useState<number | undefined>(licitacion.productos[0]?.tc_envio);
  // Costos de TODA la licitación (no por producto), ej. boleta de garantía.
  const [garantiaLic, setGarantiaLic] = useState<number>(licitacion.garantia_licitacion || 0);
  const [pasajeLic, setPasajeLic]     = useState<number>(licitacion.pasaje_licitacion || 0);
  const [envioLic, setEnvioLic]       = useState<number>(licitacion.envio_licitacion || 0);
  const [otrosLic, setOtrosLic]       = useState<number>(licitacion.otros_costos_licitacion || 0);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Enlace compartido: cambia de empresa si la licitación es de otra empresa del
  // usuario y señala el producto indicado en ?item=.
  const { itemId: sharedItemId } = useShareTarget(licitacion.company_id);
  const sharePath = `/licitaciones/${licitacion.id}`;
  const scrolledTo = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!sharedItemId || scrolledTo.current === sharedItemId) return;
    if (!productos.some(p => p.id === sharedItemId)) return;
    scrolledTo.current = sharedItemId;
    setExpandedIds(prev => new Set([...prev, sharedItemId]));
    requestAnimationFrame(() => {
      document.getElementById(`producto-${sharedItemId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [sharedItemId, productos]);

  // ¿Todos los productos comparten el mismo T/C? (si no, avisamos que hay valores mixtos)
  const allSameTcCompra = productos.length <= 1 || productos.every(p => p.tc === productos[0].tc);
  const allSameTcEnvio  = productos.length <= 1 || productos.every(p => (p.tc_envio ?? null) === (productos[0].tc_envio ?? null));

  // Aplica un T/C a TODOS los productos de la licitación de una sola vez.
  const applyTcCompraAll = (v: number | undefined) => {
    const val = v ?? 0;
    setHeaderTcCompra(val);
    setProductos(prev => prev.map(p => ({ ...p, tc: val })));
  };
  const applyTcEnvioAll = (v: number | undefined) => {
    setHeaderTcEnvio(v);
    setProductos(prev => prev.map(p => ({ ...p, tc_envio: v })));
  };

  // Recalcular todo cada vez que cambian productos o los defaults de la cotización
  const calcs = useMemo(
    () => productos.map(p => calcProducto(p, { tcOficial, fleteCifPct })),
    [productos, tcOficial, fleteCifPct],
  );
  const costosLicitacionTotal = round2(garantiaLic + pasajeLic + envioLic + otrosLic);
  const resumen = useMemo(
    () => calcResumen(productos, calcs, costosLicitacionTotal),
    [productos, calcs, costosLicitacionTotal]
  );

  // ── Edición ────────────────────────────────────────────────────────────────

  const updateProducto = useCallback((id: string, changes: Partial<LicitacionProducto>) => {
    setProductos(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
  }, []);

  const addProducto = () => {
    // Los productos nuevos heredan el T/C de compra/envío definido en la cabecera.
    const nuevo = { ...emptyProducto(licitacion.id, productos.length), tc: headerTcCompra, tc_envio: headerTcEnvio };
    setProductos(prev => [...prev, nuevo]);
    setExpandedIds(prev => new Set([...prev, nuevo.id]));
  };

  const removeProducto = (id: string) => {
    setProductos(prev => prev.filter(p => p.id !== id));
    setExpandedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  // Duplica un producto: inserta una copia justo debajo con un id nuevo,
  // heredando todos los datos para no llenarlos de cero.
  const duplicateProducto = (id: string) => {
    setProductos(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx === -1) return prev;
      const copia: LicitacionProducto = {
        ...prev[idx],
        id: crypto.randomUUID(),
        created_at: undefined,
        updated_at: undefined,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copia);
      // Renumerar `orden` según la nueva posición para que se persista al guardar.
      return next.map((p, i) => (p.orden === i ? p : { ...p, orden: i }));
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  // ── Reordenar productos (arrastrar y soltar, igual que en Embarques) ─────────
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (idx !== dragIdx) setOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    setProductos(prev => {
      const reordered = [...prev];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      // Renumerar `orden` según la nueva posición para que se persista al guardar.
      return reordered.map((p, i) => (p.orden === i ? p : { ...p, orden: i }));
    });
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  // ── Guardar ────────────────────────────────────────────────────────────────

  const costosLicitacionDirty =
    garantiaLic !== (licitacion.garantia_licitacion || 0) ||
    pasajeLic   !== (licitacion.pasaje_licitacion || 0) ||
    envioLic    !== (licitacion.envio_licitacion || 0) ||
    otrosLic    !== (licitacion.otros_costos_licitacion || 0);

  const handleSave = async () => {
    try {
      setSaving(true);
      // En la lista de licitaciones se muestra SIEMPRE el total ofertado por
      // nosotros (Σ precio_ofertado × cantidad). El referencial de la entidad
      // vive aparte en la pestaña General.
      const nuevoRef = resumen.total_ofertado;
      const refDirty = nuevoRef !== (licitacion.precio_referencial ?? 0);
      // Persistir los defaults y los costos de la licitación si cambiaron
      if (tcOficial !== (licitacion.tc_oficial ?? TC_OFICIAL)
        || fleteCifPct !== (licitacion.flete_cif_pct ?? FLETE_CIF_PCT_AEREO)
        || costosLicitacionDirty || refDirty) {
        await LicitacionStorage.update(licitacion.id, companyId, {
          tc_oficial: tcOficial,
          flete_cif_pct: fleteCifPct,
          garantia_licitacion: garantiaLic,
          pasaje_licitacion: pasajeLic,
          envio_licitacion: envioLic,
          otros_costos_licitacion: otrosLic,
          precio_referencial: nuevoRef,
        });
      }
      // Upsert todos los productos actuales
      await LicitacionStorage.upsertProductos(companyId, productos);
      // Eliminar los que fueron quitados (están en licitacion.productos pero no en productos)
      const idsActuales = new Set(productos.map(p => p.id));
      for (const p of licitacion.productos) {
        if (!idsActuales.has(p.id)) await LicitacionStorage.deleteProducto(p.id, p.licitacion_id);
      }
      onUpdated({
        ...licitacion,
        productos,
        tc_oficial: tcOficial,
        flete_cif_pct: fleteCifPct,
        garantia_licitacion: garantiaLic,
        pasaje_licitacion: pasajeLic,
        envio_licitacion: envioLic,
        otros_costos_licitacion: otrosLic,
        precio_referencial: nuevoRef,
      });
      toast.success('Cotización guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    JSON.stringify(productos) !== JSON.stringify(licitacion.productos) ||
    tcOficial !== (licitacion.tc_oficial ?? TC_OFICIAL) ||
    fleteCifPct !== (licitacion.flete_cif_pct ?? FLETE_CIF_PCT_AEREO) ||
    costosLicitacionDirty;

  // ── Exportar PDF ───────────────────────────────────────────────────────────

  const handleExportPDF = (mode: 'save' | 'view' = 'save') => {
    if (productos.length === 0) {
      toast.error('No hay productos en la cotización');
      return;
    }
    try {
      const emitCotizacion = () => exportCotizacionToPDF({
        licitacion: {
          nombre:              licitacion.nombre,
          entidad:             licitacion.entidad,
          numero_sicoes:       licitacion.numero_sicoes,
          tipo_proceso:        TIPO_PROCESO_LABELS[licitacion.tipo_proceso] || licitacion.tipo_proceso,
          fecha_presentacion:  licitacion.fecha_presentacion,
          precio_referencial:  licitacion.precio_referencial,
        },
        productos: productos.map((p, i) => ({
          nombre:          p.nombre,
          cantidad:        p.cantidad,
          precio_usd:      p.precio_usd,
          tc:              p.tc,
          total_individual: calcs[i].total_individual,
          precio_piso:     calcs[i].precio_piso,
          precio_ofertado: p.precio_ofertado,
          total_ofertado:  calcs[i].total_ofertado,
          ganancia:        calcs[i].ganancia,
          roi:             calcs[i].roi,
        })),
        resumen,
      });
      if (mode === 'view') previewNextPdf(emitCotizacion); else emitCotizacion();
      toast.success('PDF generado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el PDF');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Tipos de cambio de la licitación — se aplican a todos los productos */}
        <FormSection
          title="Tipos de cambio"
          hint="compra y envío se aplican a todos los productos"
          summary={`compra ${headerTcCompra} · aduana ${tcOficial} · CIF ${fleteCifPct}%`}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {/* T/C compra */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                T/C compra
                {!allSameTcCompra && (
                  <Tooltip>
                    <TooltipTrigger asChild><span className="text-amber-600 cursor-help">· varios</span></TooltipTrigger>
                    <TooltipContent>Hay productos con distinto T/C. Editar aquí los iguala a todos.</TooltipContent>
                  </Tooltip>
                )}
              </label>
              <NumInput value={headerTcCompra} onChange={applyTcCompraAll} min="0" step="0.01" className="w-24" />
            </div>
            {/* T/C envío */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                T/C envío
                {!allSameTcEnvio && (
                  <Tooltip>
                    <TooltipTrigger asChild><span className="text-amber-600 cursor-help">· varios</span></TooltipTrigger>
                    <TooltipContent>Hay productos con distinto T/C de envío. Editar aquí los iguala a todos.</TooltipContent>
                  </Tooltip>
                )}
              </label>
              <NumInput value={headerTcEnvio} onChange={applyTcEnvioAll} min="0" step="0.01" placeholder="= compra" className="w-24" />
            </div>
            {/* T/C aduana (tributos) */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">T/C aduana (tributos)</label>
              <div className="flex items-center gap-1.5">
                <NumInput value={tcOficial} onChange={v => setTcOficial(v ?? 0)} min="0" step="0.01" className="w-24" />
                {tcOficial !== TC_OFICIAL && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setTcOficial(TC_OFICIAL)}>
                        oficial {TC_OFICIAL}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Restablecer al T/C oficial histórico ({TC_OFICIAL})</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            {/* % del flete que entra a la base CIF */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">% flete en CIF</label>
              <div className="flex items-center gap-1.5">
                <NumInput value={fleteCifPct} onChange={v => setFleteCifPct(v ?? 0)} min="0" max="100" step="1" className="w-20" />
                <button
                  type="button"
                  className={`text-[11px] hover:underline ${fleteCifPct === FLETE_CIF_PCT_AEREO ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                  onClick={() => setFleteCifPct(FLETE_CIF_PCT_AEREO)}
                >
                  aéreo {FLETE_CIF_PCT_AEREO}%
                </button>
                <button
                  type="button"
                  className={`text-[11px] hover:underline ${fleteCifPct === FLETE_CIF_PCT_MARITIMO ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                  onClick={() => setFleteCifPct(FLETE_CIF_PCT_MARITIMO)}
                >
                  marít. {FLETE_CIF_PCT_MARITIMO}%
                </button>
              </div>
            </div>
            <div className="flex-1 min-w-[180px] flex items-end">
              <p className="text-[11px] text-muted-foreground">
                CIF = precio Bs + {fleteCifPct}% del flete + 2%. Sobre el CIF se calcula el GA, y sobre CIF + GA el IVA aduanero.
              </p>
            </div>
          </div>
        </FormSection>

        {/* Costos de TODA la licitación (no por producto) */}
        <FormSection
          title="Costos de la licitación"
          hint="se suman una sola vez al total, no se reparten entre productos"
          summary={`Bs ${fmt(costosLicitacionTotal)}`}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Field label="Garantía (Bs)">
              <NumInput value={garantiaLic || undefined} onChange={v => setGarantiaLic(v ?? 0)} min="0" className="w-28" />
            </Field>
            <Field label="Pasaje (Bs)">
              <NumInput value={pasajeLic || undefined} onChange={v => setPasajeLic(v ?? 0)} min="0" className="w-28" />
            </Field>
            <Field label="Envío (Bs)">
              <NumInput value={envioLic || undefined} onChange={v => setEnvioLic(v ?? 0)} min="0" className="w-28" />
            </Field>
            <Field label="Otros costos (Bs)">
              <NumInput value={otrosLic || undefined} onChange={v => setOtrosLic(v ?? 0)} min="0" className="w-28" />
            </Field>
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-sm font-mono font-semibold">Bs {fmt(costosLicitacionTotal)}</span>
            </div>
          </div>
        </FormSection>

        {/* Tabla de productos */}
        <div className="space-y-3">
          {productos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-lg">
              <p className="mb-3">No hay productos en esta cotización</p>
              <Button variant="outline" size="sm" onClick={addProducto} className="gap-2">
                <Plus className="h-3.5 w-3.5" /> Agregar producto
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border divide-y overflow-hidden">
              {productos.map((p, i) => (
                <ProductoRow
                  key={p.id}
                  index={i}
                  producto={p}
                  calc={calcs[i]}
                  tcOficialDefault={tcOficial}
                  fleteCifPctDefault={fleteCifPct}
                  expanded={expandedIds.has(p.id)}
                  onToggle={() => toggleExpand(p.id)}
                  onChange={changes => updateProducto(p.id, changes)}
                  onRemove={() => removeProducto(p.id)}
                  onDuplicate={() => duplicateProducto(p.id)}
                  sharePath={sharePath}
                  highlighted={sharedItemId === p.id}
                  canReorder={productos.length > 1}
                  isDragging={dragIdx === i}
                  isOver={overIdx === i && dragIdx !== i}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}

          {productos.length > 0 && (
            <Button variant="outline" size="sm" onClick={addProducto} className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Agregar producto
            </Button>
          )}
        </div>

        {/* Resumen global */}
        {productos.length > 0 && <ResumenGlobal resumen={resumen} count={productos.length} />}

        {/* Acciones footer */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => handleExportPDF('view')}
              disabled={productos.length === 0}
              title="Ver PDF"
            >
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => handleExportPDF('save')}
              disabled={productos.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar PDF
            </Button>
            <ShareButton basePath={sharePath} label="Copiar enlace a esta cotización" />
          </div>

          {isDirty && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setProductos(licitacion.productos);
                setTcOficial(licitacion.tc_oficial ?? TC_OFICIAL);
                setFleteCifPct(licitacion.flete_cif_pct ?? FLETE_CIF_PCT_AEREO);
                setHeaderTcCompra(licitacion.productos[0]?.tc ?? 9.97);
                setHeaderTcEnvio(licitacion.productos[0]?.tc_envio);
                setGarantiaLic(licitacion.garantia_licitacion || 0);
                setPasajeLic(licitacion.pasaje_licitacion || 0);
                setEnvioLic(licitacion.envio_licitacion || 0);
                setOtrosLic(licitacion.otros_costos_licitacion || 0);
              }}>
                Descartar cambios
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cotización'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Fila de producto ──────────────────────────────────────────────────────────

function ProductoRow({ producto: p, index, calc, tcOficialDefault, fleteCifPctDefault, expanded, onToggle, onChange, onRemove, onDuplicate, sharePath, highlighted, canReorder, isDragging, isOver, onDragStart, onDragOver, onDrop, onDragEnd }: {
  producto: LicitacionProducto;
  index: number;
  calc: ReturnType<typeof calcProducto>;
  tcOficialDefault: number;
  fleteCifPctDefault: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (c: Partial<LicitacionProducto>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  sharePath: string;
  highlighted?: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const isUnprofitable = calc.ganancia < 0;
  const isBelowFloor   = p.precio_ofertado > 0 && p.precio_ofertado < calc.precio_piso;
  // Mi oferta por encima del precio referencial de la entidad (en licitaciones suele ser motivo de descalificación).
  const isOverEntidad  = p.precio_entidad != null && p.precio_entidad > 0 && p.precio_ofertado > p.precio_entidad;

  return (
    <div
      className="drag-row-lic"
      onDragStart={canReorder ? onDragStart : undefined}
      onDragOver={canReorder ? onDragOver : undefined}
      onDrop={canReorder ? onDrop : undefined}
      onDragEnd={canReorder ? e => { (e.currentTarget as HTMLElement).draggable = false; onDragEnd(); } : undefined}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderTop: isOver ? '2px solid hsl(var(--primary))' : undefined,
        transition: 'opacity 0.15s',
      }}
    >
    <Collapsible open={expanded} onOpenChange={onToggle}>
      {/* Fila compacta (siempre visible) */}
      <CollapsibleTrigger asChild>
        <div
          id={`producto-${p.id}`}
          className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${
            highlighted ? 'ring-2 ring-inset ring-primary/60 bg-primary/5' : isUnprofitable ? 'bg-red-50/30 dark:bg-red-950/10' : ''
          }`}
        >
          {canReorder && (
            <span
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors flex items-center shrink-0"
              onMouseDown={e => {
                e.stopPropagation();
                const row = (e.currentTarget as HTMLElement).closest('.drag-row-lic') as HTMLElement | null;
                if (row) row.draggable = true;
              }}
              onClick={e => e.stopPropagation()}
              title="Arrastra para reordenar"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <span className="text-xs font-semibold text-muted-foreground tabular-nums w-5 text-right shrink-0">{index + 1}</span>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{p.nombre || <span className="italic text-muted-foreground">Sin nombre</span>}</span>
              {p.origen === 'local' && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">Local</Badge>
              )}
              {p.link_producto && /^https?:\/\//i.test(p.link_producto) && (
                <a
                  href={p.link_producto}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </a>
              )}
              {isBelowFloor && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Precio ofertado por debajo del precio piso</TooltipContent>
                </Tooltip>
              )}
            </div>
            {p.especificacion && (
              <div className="text-xs text-muted-foreground truncate">{p.especificacion}</div>
            )}
            <div className="text-xs text-muted-foreground">
              {p.origen === 'local' ? <>Q: {p.cantidad}</> : <>Q: {p.cantidad} · T/C {p.tc}</>}
            </div>
          </div>

          {/* Precio de compra — editable inline */}
          <div
            className="hidden md:flex flex-col items-end shrink-0"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="text-[10px] text-muted-foreground">Compra ({p.origen === 'local' ? 'Bs' : 'USD'})</span>
            {p.origen === 'local' ? (
              <NumInput
                value={p.precio_local}
                onChange={v => onChange({ precio_local: v })}
                min="0"
                step="0.01"
                placeholder="0"
                className="w-24"
              />
            ) : (
              <NumInput
                value={p.precio_usd}
                onChange={v => onChange({ precio_usd: v ?? 0 })}
                min="0"
                step="0.001"
                placeholder="0"
                className="w-24"
              />
            )}
          </div>

          {/* Precio piso */}
          <div className="hidden md:flex flex-col items-end shrink-0">
            <span className="text-[10px] text-muted-foreground">Precio piso</span>
            <span className={`text-sm font-mono ${isBelowFloor ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
              Bs {fmt(calc.precio_piso)}
            </span>
          </div>

          {/* Precio entidad (referencial) — editable inline */}
          <div
            className="hidden md:flex flex-col items-end shrink-0"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="text-[10px] text-muted-foreground">Entidad</span>
            <NumInput
              value={p.precio_entidad}
              onChange={v => onChange({ precio_entidad: v })}
              min="0"
              step="0.01"
              placeholder="—"
              className="w-24"
            />
          </div>

          {/* Precio ofertado — editable inline */}
          <div
            className="flex flex-col items-end shrink-0"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <span className="text-[10px] text-muted-foreground">Ofertado</span>
            <NumInput
              value={p.precio_ofertado || undefined}
              onChange={v => onChange({ precio_ofertado: v ?? 0 })}
              min="0"
              step="0.01"
              placeholder="0"
              className={`w-24 font-semibold ${isOverEntidad ? 'border-amber-400 text-amber-600' : ''}`}
            />
          </div>

          {/* Ganancia */}
          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="text-[10px] text-muted-foreground">Ganancia</span>
            <span className={`text-sm font-mono flex items-center gap-1 ${isUnprofitable ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
              {isUnprofitable ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              Bs {fmt(calc.ganancia)}
            </span>
          </div>

          {/* ROI */}
          <div className="hidden lg:flex flex-col items-end shrink-0 w-14">
            <span className="text-[10px] text-muted-foreground">ROI</span>
            <span className={`text-sm font-mono ${isUnprofitable ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
              <Pct v={calc.roi} />
            </span>
          </div>

          <ShareButton basePath={sharePath} itemId={p.id} variant="icon" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            title="Duplicar producto"
            onClick={e => { e.stopPropagation(); onDuplicate(); }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            title="Eliminar producto"
            onClick={e => { e.stopPropagation(); onRemove(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CollapsibleTrigger>

      {/* Formulario expandido */}
      <CollapsibleContent>
        <div className="px-2 sm:px-4 pb-4 pt-2 bg-muted/20 border-t">
          <ProductoForm producto={p} calc={calc} tcOficialDefault={tcOficialDefault} fleteCifPctDefault={fleteCifPctDefault} onChange={onChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
    </div>
  );
}

// ─── Formulario detallado de producto ─────────────────────────────────────────

function ProductoForm({ producto: p, calc, tcOficialDefault, fleteCifPctDefault, onChange }: {
  producto: LicitacionProducto;
  calc: ReturnType<typeof calcProducto>;
  tcOficialDefault: number;
  fleteCifPctDefault: number;
  onChange: (c: Partial<LicitacionProducto>) => void;
}) {
  const n = (k: keyof LicitacionProducto) => (v: number | undefined) => onChange({ [k]: v });
  const s = (k: keyof LicitacionProducto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [k]: e.target.value });

  const esLocal = p.origen === 'local';
  const bajoPiso = p.precio_ofertado > 0 && p.precio_ofertado < calc.precio_piso;
  const extras = round2((p.garantia || 0) + (p.pasaje || 0) + (p.envio_local || 0) + (p.otros_costos || 0));
  const manualesActivos = [
    p.usa_flete_manual, p.usa_manipuleo_manual, p.usa_ga_manual, p.usa_iva_manual,
  ].filter(Boolean).length;

  return (
    <div className="space-y-2.5">
      {/* Nombre y origen: siempre visibles */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
        <div className="space-y-1 flex-1 min-w-0">
          <label className="text-[11px] text-muted-foreground">Nombre del producto</label>
          <Input className="h-9 sm:h-8 text-xs" value={p.nombre} onChange={s('nombre')} placeholder="Ej: SSD Timetec 512GB" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Origen</label>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={!esLocal ? 'default' : 'outline'} className="h-9 sm:h-8 text-xs px-3" onClick={() => onChange({ origen: 'importado' })}>
              Importado
            </Button>
            <Button type="button" size="sm" variant={esLocal ? 'default' : 'outline'} className="h-9 sm:h-8 text-xs px-3" onClick={() => onChange({ origen: 'local' })}>
              Compra local
            </Button>
          </div>
        </div>
      </div>

      {/* Descripción y enlace: junto al nombre, siempre visibles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Especificación</label>
          <Input className="h-9 sm:h-8 text-xs" value={p.especificacion || ''} onChange={s('especificacion')} placeholder="Ej: 256GB / WiFi" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Link del producto</label>
          <Input className="h-9 sm:h-8 text-xs" value={p.link_producto || ''} onChange={s('link_producto')} placeholder="https://..." />
        </div>
      </div>

      {/* Precio ofertado: el campo que más se toca, siempre a la vista */}
      <div className="rounded-lg border bg-background/60 px-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Precio ofertado <span className="text-muted-foreground font-normal">Bs/u</span></label>
            <Input
              type="number" inputMode="decimal" min="0" step="0.01"
              className={`h-9 font-mono font-semibold text-sm ${bajoPiso ? 'border-amber-400' : ''}`}
              value={p.precio_ofertado || ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_ofertado: toDecimal(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Precio entidad <span className="text-muted-foreground font-normal">referencial</span></label>
            <Input
              type="number" inputMode="decimal" min="0" step="0.01"
              className="h-9 font-mono text-sm"
              value={p.precio_entidad ?? ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_entidad: e.target.value === '' ? undefined : (toDecimal(e.target.value) || 0) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <ResultCard label="Precio piso" value={calc.precio_piso} hint="Venta mínima por unidad para no perder" color={bajoPiso ? 'text-amber-500' : undefined} />
          <ResultCard label="Costo unit." value={calc.total_individual} hint="Costo puesto en almacén por unidad" />
          <ResultCard label="Ganancia" value={calc.ganancia} bold hint="Total ofertado − Costos" color={calc.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
          <ResultCard label="ROI" value={calc.roi} isPct bold hint="Ganancia / Costos" color={calc.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
        </div>

        {p.precio_entidad != null && p.precio_entidad > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Vs. entidad:{' '}
            <span className={`font-mono font-semibold ${p.precio_ofertado > p.precio_entidad ? 'text-amber-600' : 'text-green-600 dark:text-green-400'}`}>
              {p.precio_ofertado > p.precio_entidad ? '+' : ''}{fmt(p.precio_ofertado - p.precio_entidad)}
              {' '}({((p.precio_ofertado / p.precio_entidad - 1) * 100).toFixed(1)}%)
            </span>
            {' · '}Total ofertado: <span className="font-mono">Bs {fmt(calc.total_ofertado)}</span>
          </p>
        )}
      </div>

      {esLocal ? (
        <FormSection title="Compra local" defaultOpen summary={`Bs ${fmt(p.precio_local || 0)} · Q ${p.cantidad}`}>
          <CostoLocal producto={p} calc={calc} onChange={onChange} />
        </FormSection>
      ) : (
        <CostoImportacion
          producto={p}
          calc={calc}
          tcOficialDefault={tcOficialDefault}
          fleteCifPctDefault={fleteCifPctDefault}
          onChange={onChange}
          manualesActivos={manualesActivos}
        />
      )}

      <FormSection title="Costos adicionales" hint="se suman al costo de este producto" summary={`Bs ${fmt(extras)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
          <Field label="Garantía (Bs total)">
            <NumInput value={p.garantia || undefined} onChange={n('garantia')} min="0" placeholder="0" />
          </Field>
          <Field label="Pasaje (Bs)">
            <NumInput value={p.pasaje || undefined} onChange={n('pasaje')} min="0" placeholder="0" />
          </Field>
          <Field label="Envío local (Bs)">
            <NumInput value={p.envio_local || undefined} onChange={n('envio_local')} min="0" placeholder="0" />
          </Field>
          <Field label="Otros costos (Bs)">
            <NumInput value={p.otros_costos || undefined} onChange={n('otros_costos')} min="0" placeholder="0" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Impuestos y resultado" summary={`costos Bs ${fmt(calc.costos)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <ResultCard label="IVA a pagar"  value={calc.iva_pagar}      hint="13% ofertado − crédito fiscal" />
          <ResultCard label="IT a pagar"   value={calc.it_pagar}       hint="3% del total ofertado" />
          <ResultCard label="Total ofertado" value={calc.total_ofertado} hint="Precio ofertado × cantidad" />
          <ResultCard label="Costos total" value={calc.costos}         hint="Costo del producto + IVA + IT + extras" bold />
          <ResultCard
            label="Ganancia"
            value={calc.ganancia}
            hint="Total ofertado − Costos"
            bold
            color={calc.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
          />
        </div>
      </FormSection>

    </div>
  );
}

// ─── Costo de importación (secciones del formulario, origen='importado') ─────

function CostoImportacion({ producto: p, calc, tcOficialDefault, fleteCifPctDefault, onChange, manualesActivos }: {
  producto: LicitacionProducto;
  calc: ReturnType<typeof calcProducto>;
  tcOficialDefault: number;
  fleteCifPctDefault: number;
  onChange: (c: Partial<LicitacionProducto>) => void;
  manualesActivos: number;
}) {
  const n = (k: keyof LicitacionProducto) => (v: number | undefined) => onChange({ [k]: v });
  const s = (k: keyof LicitacionProducto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [k]: e.target.value });

  return (
    <>
      <FormSection
        title="Compra e impuestos"
        defaultOpen
        summary={`USD ${fmt(p.precio_usd ?? 0)} · Q ${p.cantidad} · GA ${p.ga_pct}%`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5">
          <Field label="Cantidad">
            <NumInput value={p.cantidad} onChange={n('cantidad')} min="1" step="1" />
          </Field>
          <Field label="Precio USD">
            <NumInput value={p.precio_usd} onChange={n('precio_usd')} min="0" step="0.001" />
          </Field>
          <Field label="Tax proveedor %">
            <NumInput value={p.tax_pct} onChange={n('tax_pct')} min="0" />
          </Field>
          <Field label="GA %" hint="Gravamen Arancelario">
            <NumInput value={p.ga_pct} onChange={n('ga_pct')} min="0" />
          </Field>
          <Field label="T/C compra">
            <NumInput value={p.tc} onChange={n('tc')} min="0" step="0.01" />
          </Field>
          <Field label="T/C envío">
            <NumInput value={p.tc_envio} onChange={n('tc_envio')} min="0" step="0.01" placeholder="= compra" />
          </Field>
          <Field label="T/C aduana" hint="GA + IVA">
            <NumInput value={p.tc_oficial} onChange={n('tc_oficial')} min="0" step="0.01" placeholder={`= ${tcOficialDefault}`} />
          </Field>
          <Field label="% flete en CIF" hint="10 aéreo / 25 marít.">
            <NumInput value={p.flete_cif_pct} onChange={n('flete_cif_pct')} min="0" max="100" step="1" placeholder={`= ${fleteCifPctDefault}`} />
          </Field>
        </div>

        <div className="mt-3 w-32">
          <Field label="HS Code">
            <Input className="h-9 sm:h-7 text-xs" value={p.hs_code || ''} onChange={s('hs_code')} placeholder="0000.00" />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Peso y flete"
        summary={`${p.usa_peso_bruto ? 'bruto' : 'vol.'} ${fmt(calc.peso)} kg · envío Bs ${fmt(calc.envio)}`}
      >
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2.5">
          <Field label="M1 (cm)">
            <NumInput value={p.m1} onChange={n('m1')} min="0" step="0.1" />
          </Field>
          <Field label="M2 (cm)">
            <NumInput value={p.m2} onChange={n('m2')} min="0" step="0.1" />
          </Field>
          <Field label="M3 (cm)">
            <NumInput value={p.m3} onChange={n('m3')} min="0" step="0.1" />
          </Field>
          <Field label="Peso (kg)" hint="bruto">
            <NumInput value={p.peso_bruto} onChange={n('peso_bruto')} min="0" step="0.001" />
          </Field>
          <Field label="Envío $/kg">
            <NumInput value={p.tarifa_envio} onChange={n('tarifa_envio')} min="0" step="0.5" />
          </Field>
          <Field label="Manip. Bs/kg">
            <NumInput value={p.tarifa_manipuleo} onChange={n('tarifa_manipuleo')} min="0" step="0.5" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Peso para flete</label>
            <div className="flex gap-1">
              <Button
                type="button" size="sm"
                variant={!p.usa_peso_bruto ? 'default' : 'outline'}
                className="h-8 text-xs px-2 gap-1"
                onClick={() => onChange({ usa_peso_bruto: false })}
              >
                <Box className="h-3 w-3" />
                Vol.{calc.peso_vol > 0 ? ` (${calc.peso_vol} kg)` : ''}
              </Button>
              <Button
                type="button" size="sm"
                variant={p.usa_peso_bruto ? 'default' : 'outline'}
                className="h-8 text-xs px-2 gap-1"
                onClick={() => onChange({ usa_peso_bruto: true })}
              >
                <Weight className="h-3 w-3" />
                Bruto{p.peso_bruto ? ` (${p.peso_bruto} kg)` : ''}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer min-h-9">
            <input
              type="checkbox"
              checked={p.tiene_bateria}
              onChange={e => onChange({ tiene_bateria: e.target.checked })}
              className="rounded"
            />
            Tiene batería
          </label>
          {p.tiene_bateria && (
            <Field label="Costo batería (Bs)" className="w-32">
              <NumInput value={p.costo_bateria} onChange={n('costo_bateria')} min="0" />
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Valores manuales"
        hint="reemplazan al cálculo (ej. cifras de la DUI)"
        summary={manualesActivos > 0 ? `${manualesActivos} activo${manualesActivos > 1 ? 's' : ''}` : 'automáticos'}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
          <ManualOverride
            label="Flete" cantidad={p.cantidad}
            usa={!!p.usa_flete_manual} valor={p.flete_manual} esTotal={!!p.flete_manual_es_total}
            calculado={calc.envio_calculado} calculadoHint="peso × tarifa × T/C envío"
            onUsa={v => onChange({ usa_flete_manual: v })}
            onValor={v => onChange({ flete_manual: v })}
            onEsTotal={v => onChange({ flete_manual_es_total: v })}
          />
          <ManualOverride
            label="Manipuleo" cantidad={p.cantidad}
            usa={!!p.usa_manipuleo_manual} valor={p.manipuleo_manual} esTotal={!!p.manipuleo_manual_es_total}
            calculado={calc.manipuleo_calculado} calculadoHint="peso × tarifa de manipuleo"
            onUsa={v => onChange({ usa_manipuleo_manual: v })}
            onValor={v => onChange({ manipuleo_manual: v })}
            onEsTotal={v => onChange({ manipuleo_manual_es_total: v })}
          />
          <ManualOverride
            label="GA (gravamen)" cantidad={p.cantidad}
            usa={p.usa_ga_manual} valor={p.ga_manual} esTotal={!!p.ga_manual_es_total}
            calculado={calc.ga_calculado} calculadoHint="CIF × GA%"
            onUsa={v => onChange({ usa_ga_manual: v })}
            onValor={v => onChange({ ga_manual: v })}
            onEsTotal={v => onChange({ ga_manual_es_total: v })}
          />
          <ManualOverride
            label="IVA aduana" cantidad={p.cantidad}
            usa={p.usa_iva_manual} valor={p.iva_aduana_manual} esTotal={!!p.iva_manual_es_total}
            calculado={calc.iva_aduana_calculado} calculadoHint="(CIF + GA) × 14,94%"
            onUsa={v => onChange({ usa_iva_manual: v })}
            onValor={v => onChange({ iva_aduana_manual: v })}
            onEsTotal={v => onChange({ iva_manual_es_total: v })}
          />
        </div>
      </FormSection>

      <FormSection title="Detalle del costeo" summary={`costo unit. Bs ${fmt(calc.total_individual)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Precio Bs',   value: calc.precio_bs,       hint: '(USD + tax) × T/C' },
            { label: 'Precio BOB',  value: calc.precio_bob,      hint: `USD × ${p.tc_oficial ?? tcOficialDefault} (T/C aduana)` },
            {
              label: p.usa_peso_bruto ? 'Peso bruto' : 'Peso vol.',
              value: calc.peso,
              hint: p.usa_peso_bruto
                ? `kg bruto (vol. = ${calc.peso_vol} kg)`
                : 'kg volumétrico — (M1×M2×M3)/5000',
            },
            {
              label: p.usa_flete_manual ? 'Envío (manual)' : 'Envío',
              value: calc.envio,
              hint: p.usa_flete_manual
                ? `Bs/unidad manual (auto = ${fmt(calc.envio_calculado)})`
                : 'Bs/unidad — costo real (100%)',
            },
            {
              label: 'Base CIF',
              value: calc.cif,
              hint: `Precio BOB + ${p.flete_cif_pct ?? fleteCifPctDefault}% del flete (${fmt(calc.flete_cif)}) + 2% — base de GA e IVA`,
            },
            {
              label: p.usa_ga_manual ? 'GA (manual)' : 'GA',
              value: calc.ga,
              hint: p.usa_ga_manual
                ? `Bs/unidad manual (auto = ${fmt(calc.ga_calculado)})`
                : 'CIF × GA% — Bs/unidad',
            },
            {
              label: p.usa_iva_manual ? 'IVA aduana (manual)' : 'IVA aduana',
              value: calc.iva_aduana,
              hint: p.usa_iva_manual
                ? `Bs/unidad manual (auto = ${fmt(calc.iva_aduana_calculado)})`
                : 'Bs/unidad — calculado',
            },
            {
              label: p.usa_manipuleo_manual ? 'Manipuleo (manual)' : 'Manipuleo',
              value: calc.manipuleo,
              hint: p.usa_manipuleo_manual
                ? `Bs/unidad manual (auto = ${fmt(calc.manipuleo_calculado)})`
                : 'Bs/unidad',
            },
            { label: 'Costo unit.', value: calc.total_individual, hint: 'Bs — total importación/unidad', bold: true },
          ].map(({ label, value, hint, bold }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={`text-xs font-mono ${bold ? 'font-semibold' : ''}`}>Bs {fmt(value)}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </FormSection>
    </>
  );
}

// ─── Costo de compra local (sección del formulario, origen='local') ──────────

function CostoLocal({ producto: p, calc, onChange }: {
  producto: LicitacionProducto;
  calc: ReturnType<typeof calcProducto>;
  onChange: (c: Partial<LicitacionProducto>) => void;
}) {
  const n = (k: keyof LicitacionProducto) => (v: number | undefined) => onChange({ [k]: v });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Compra local</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-3">
        <Field label="Cantidad">
          <NumInput value={p.cantidad} onChange={n('cantidad')} min="1" step="1" />
        </Field>
        <Field label="Precio unitario (Bs)">
          <NumInput value={p.precio_local} onChange={n('precio_local')} min="0" step="0.01" />
        </Field>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer h-7">
            <input
              type="checkbox"
              checked={!!p.tiene_factura}
              onChange={e => onChange({ tiene_factura: e.target.checked })}
              className="rounded"
            />
            ¿Con factura?
          </label>
          <p className="text-[10px] text-muted-foreground">
            {p.tiene_factura ? 'Da derecho a crédito fiscal (13%)' : 'Sin crédito fiscal'}
          </p>
        </div>
      </div>

      {/* Batería */}
      <div className="flex items-center gap-4 mt-3">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={p.tiene_bateria}
            onChange={e => onChange({ tiene_bateria: e.target.checked })}
            className="rounded"
          />
          Tiene batería
        </label>
        {p.tiene_bateria && (
          <Field label="Costo batería (Bs)" className="w-36">
            <NumInput value={p.costo_bateria} onChange={n('costo_bateria')} min="0" />
          </Field>
        )}
      </div>

      {/* Resultados compra local */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
              <p className="text-[10px] text-muted-foreground">Precio local</p>
              <p className="text-xs font-mono">Bs {fmt(p.precio_local || 0)}</p>
            </div>
          </TooltipTrigger>
          <TooltipContent>Bs/unidad — precio de compra</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
              <p className="text-[10px] text-muted-foreground">Crédito fiscal</p>
              <p className="text-xs font-mono">Bs {fmt(calc.iva_aduana)}</p>
            </div>
          </TooltipTrigger>
          <TooltipContent>Bs/unidad — 13% del precio local, solo si tiene factura</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
              <p className="text-[10px] text-muted-foreground">Costo unit.</p>
              <p className="text-xs font-mono font-semibold">Bs {fmt(calc.total_individual)}</p>
            </div>
          </TooltipTrigger>
          <TooltipContent>Bs — costo de compra local por unidad</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Resumen global ────────────────────────────────────────────────────────────

function ResumenGlobal({ resumen: r, count }: { resumen: ReturnType<typeof calcResumen>; count: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Resumen — {count} producto{count !== 1 ? 's' : ''}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {r.tiene_importados && <SummaryItem label="Costo productos importados" value={r.costo_importados} />}
          {r.tiene_nacionales && <SummaryItem label="Costo mercadería nacional" value={r.costo_nacional} />}
          <SummaryItem label="Precio piso total" value={r.precio_piso_total} />
          <SummaryItem label="Total ofertado" value={r.total_ofertado} />
          <SummaryItem label="IVA a pagar" value={r.iva_pagar} />
          <SummaryItem label="IT a pagar" value={r.it_pagar} />
          {r.costos_licitacion > 0 && (
            <SummaryItem label="Costos de la licitación" value={r.costos_licitacion} />
          )}
          <SummaryItem
            label="Costos totales"
            value={r.costos}
            bold
          />
          <SummaryItem
            label="Ganancia"
            value={r.ganancia}
            bold
            color={r.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
          />
        </div>

        {/* Desglose de costos — productos importados */}
        {r.tiene_importados && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Desglose — productos importados
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryItem label="Precio total (USD)" value={r.total_usd} unit="USD" />
              <SummaryItem label="Compra (Bs)" value={r.total_precio_bs} />
              <SummaryItem label="Envío" value={r.total_envio} />
              <SummaryItem label="GA (gravamen)" value={r.total_ga} />
              <SummaryItem label="IVA aduana" value={r.total_iva_aduana} />
              <SummaryItem label="Manipuleo" value={r.total_manipuleo} />
            </div>
          </div>
        )}

        {/* Desglose de costos — mercadería comprada nacionalmente */}
        {r.tiene_nacionales && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Desglose — mercadería comprada nacionalmente
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryItem label="Costo compra nacional" value={r.costo_nacional} />
              <SummaryItem label="Crédito fiscal (facturas)" value={r.total_iva_credito_local} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">ROI global:</span>
          <span className={`text-base font-bold font-mono ${r.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
            <Pct v={r.roi} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Piezas UI ─────────────────────────────────────────────────────────────────

function Field({ label, hint, className = '', children }: {
  label: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs text-muted-foreground">{label}{hint && <span className="ml-1 opacity-60">({hint})</span>}</label>
      {children}
    </div>
  );
}

function ResultCard({ label, value, isPct, hint, bold, color }: {
  label: string; value: number; isPct?: boolean; hint?: string; bold?: boolean; color?: string;
}) {
  const text = isPct ? <Pct v={value} decimals={2} /> : `Bs ${fmt(value)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className={`text-xs font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>{text}</p>
        </div>
      </TooltipTrigger>
      {hint && <TooltipContent>{hint}</TooltipContent>}
    </Tooltip>
  );
}

function SummaryItem({ label, value, bold, color, unit = 'Bs' }: {
  label: string; value: number; bold?: boolean; color?: string; unit?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>
        {unit} {fmt(value)}
      </p>
    </div>
  );
}
