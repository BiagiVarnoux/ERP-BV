// src/components/licitaciones/cotizadores/CotizadorImportacion.tsx
// Cotizador específico para licitaciones de importación (BV).
// Calcula costos USD→Bs, GA, IVA aduanera, flete, manipuleo y contribución neta.

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, TrendingUp, TrendingDown, Download, Weight, Box } from 'lucide-react';
import { toast } from 'sonner';
import { Licitacion, LicitacionProducto } from '@/accounting/licitacion-types';
import { calcProducto, calcResumen, emptyProducto, TC_OFICIAL } from '@/accounting/licitacion-utils';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { fmt, round2 } from '@/accounting/utils';
import { toDecimal } from '@/accounting/utils';
import { exportCotizacionToPDF } from '@/services/pdfService';
import { TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function NumInput({
  value, onChange, className = '', min, step = '0.01', placeholder = '0',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  className?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      min={min}
      step={step}
      className={`h-7 text-xs px-1.5 text-right ${className}`}
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
  const [productos, setProductos] = useState<LicitacionProducto[]>(licitacion.productos);
  const [tcOficial, setTcOficial] = useState<number>(licitacion.tc_oficial ?? TC_OFICIAL);
  // T/C de compra y envío a nivel de licitación: se aplican en bloque a todos los productos.
  const [headerTcCompra, setHeaderTcCompra] = useState<number>(licitacion.productos[0]?.tc ?? 9.97);
  const [headerTcEnvio, setHeaderTcEnvio]   = useState<number | undefined>(licitacion.productos[0]?.tc_envio);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  // Recalcular todo cada vez que cambia productos o el T/C aduanero por defecto
  const calcs = useMemo(() => productos.map(p => calcProducto(p, tcOficial)), [productos, tcOficial]);
  const resumen = useMemo(() => calcResumen(productos, calcs), [productos, calcs]);

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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  // ── Guardar ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    try {
      setSaving(true);
      // Persistir el T/C aduanero por defecto de la cotización si cambió
      if (tcOficial !== (licitacion.tc_oficial ?? TC_OFICIAL)) {
        await LicitacionStorage.update(licitacion.id, { tc_oficial: tcOficial });
      }
      // Upsert todos los productos actuales
      await LicitacionStorage.upsertProductos(productos);
      // Eliminar los que fueron quitados (están en licitacion.productos pero no en productos)
      const idsActuales = new Set(productos.map(p => p.id));
      for (const p of licitacion.productos) {
        if (!idsActuales.has(p.id)) await LicitacionStorage.deleteProducto(p.id, p.licitacion_id);
      }
      onUpdated({ ...licitacion, productos, tc_oficial: tcOficial });
      toast.success('Cotización guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    JSON.stringify(productos) !== JSON.stringify(licitacion.productos) ||
    tcOficial !== (licitacion.tc_oficial ?? TC_OFICIAL);

  // ── Exportar PDF ───────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    if (productos.length === 0) {
      toast.error('No hay productos en la cotización');
      return;
    }
    try {
      exportCotizacionToPDF({
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
        <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Tipos de cambio de la licitación</span>
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              Compra y envío se aplican a todos los productos
            </span>
          </div>
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
            <div className="flex-1 min-w-[180px] flex items-end">
              <p className="text-[11px] text-muted-foreground">
                El T/C de aduana es la base de GA + IVA; cada producto puede sobreescribirlo individualmente.
              </p>
            </div>
          </div>
        </div>

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
                  producto={p}
                  calc={calcs[i]}
                  tcOficialDefault={tcOficial}
                  expanded={expandedIds.has(p.id)}
                  onToggle={() => toggleExpand(p.id)}
                  onChange={changes => updateProducto(p.id, changes)}
                  onRemove={() => removeProducto(p.id)}
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportPDF}
            disabled={productos.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar PDF
          </Button>

          {isDirty && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setProductos(licitacion.productos);
                setTcOficial(licitacion.tc_oficial ?? TC_OFICIAL);
                setHeaderTcCompra(licitacion.productos[0]?.tc ?? 9.97);
                setHeaderTcEnvio(licitacion.productos[0]?.tc_envio);
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

function ProductoRow({ producto: p, calc, tcOficialDefault, expanded, onToggle, onChange, onRemove }: {
  producto: LicitacionProducto;
  calc: ReturnType<typeof calcProducto>;
  tcOficialDefault: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (c: Partial<LicitacionProducto>) => void;
  onRemove: () => void;
}) {
  const isUnprofitable = calc.ganancia < 0;
  const isBelowFloor   = p.precio_ofertado > 0 && p.precio_ofertado < calc.precio_piso;
  // Mi oferta por encima del precio referencial de la entidad (en licitaciones suele ser motivo de descalificación).
  const isOverEntidad  = p.precio_entidad != null && p.precio_entidad > 0 && p.precio_ofertado > p.precio_entidad;

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      {/* Fila compacta (siempre visible) */}
      <CollapsibleTrigger asChild>
        <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${isUnprofitable ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{p.nombre || <span className="italic text-muted-foreground">Sin nombre</span>}</span>
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
            <div className="text-xs text-muted-foreground">
              Q: {p.cantidad} · USD {fmt(p.precio_usd ?? 0)} · T/C {p.tc}
            </div>
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

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={e => { e.stopPropagation(); onRemove(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CollapsibleTrigger>

      {/* Formulario expandido */}
      <CollapsibleContent>
        <div className="px-4 pb-5 pt-1 bg-muted/20 border-t space-y-5">
          <ProductoForm producto={p} calc={calc} tcOficialDefault={tcOficialDefault} onChange={onChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Formulario detallado de producto ─────────────────────────────────────────

function ProductoForm({ producto: p, calc, tcOficialDefault, onChange }: {
  producto: LicitacionProducto;
  calc: ReturnType<typeof calcProducto>;
  tcOficialDefault: number;
  onChange: (c: Partial<LicitacionProducto>) => void;
}) {
  const n = (k: keyof LicitacionProducto) => (v: number | undefined) => onChange({ [k]: v });
  const s = (k: keyof LicitacionProducto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [k]: e.target.value });

  return (
    <div className="space-y-5">
      {/* Descripción */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre del producto</label>
          <Input className="h-7 text-xs" value={p.nombre} onChange={s('nombre')} placeholder="Ej: SSD Timetec 512GB" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Especificación</label>
          <Input className="h-7 text-xs" value={p.especificacion || ''} onChange={s('especificacion')} placeholder="Ej: 256GB / WiFi" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Link del producto</label>
          <Input className="h-7 text-xs" value={p.link_producto || ''} onChange={s('link_producto')} placeholder="https://..." />
        </div>
      </div>

      <Separator />

      {/* Sección IMPORTACIÓN */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Costo de importación</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-3">
          <Field label="Cantidad">
            <NumInput value={p.cantidad} onChange={n('cantidad')} min="1" step="1" />
          </Field>
          <Field label="Precio USD">
            <NumInput value={p.precio_usd} onChange={n('precio_usd')} min="0" step="0.001" />
          </Field>
          <Field label="Tax proveedor %">
            <NumInput value={p.tax_pct} onChange={n('tax_pct')} min="0" />
          </Field>
          <Field label="T/C compra">
            <NumInput value={p.tc} onChange={n('tc')} min="0" step="0.01" />
          </Field>
          <Field label="T/C envío">
            <NumInput value={p.tc_envio} onChange={n('tc_envio')} min="0" step="0.01" placeholder="= T/C compra" />
          </Field>
          <Field label="T/C aduana" hint="tributos GA + IVA">
            <NumInput value={p.tc_oficial} onChange={n('tc_oficial')} min="0" step="0.01" placeholder={`= cotiz. (${tcOficialDefault})`} />
          </Field>
          <Field label="GA %" hint="Gravamen Arancelario">
            <NumInput value={p.ga_pct} onChange={n('ga_pct')} min="0" />
          </Field>
        </div>

        {/* Dimensiones + Peso */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-3 mt-3">
          <Field label="M1 (cm)">
            <NumInput value={p.m1} onChange={n('m1')} min="0" step="0.1" />
          </Field>
          <Field label="M2 (cm)">
            <NumInput value={p.m2} onChange={n('m2')} min="0" step="0.1" />
          </Field>
          <Field label="M3 (cm)">
            <NumInput value={p.m3} onChange={n('m3')} min="0" step="0.1" />
          </Field>
          <Field label="Peso bruto (kg)" hint="alternativo al volumétrico">
            <NumInput value={p.peso_bruto} onChange={n('peso_bruto')} min="0" step="0.001" />
          </Field>
          <Field label="Tarifa envío (USD/kg)">
            <NumInput value={p.tarifa_envio} onChange={n('tarifa_envio')} min="0" step="0.5" />
          </Field>
          <Field label="Tarifa manipuleo (Bs/kg)">
            <NumInput value={p.tarifa_manipuleo} onChange={n('tarifa_manipuleo')} min="0" step="0.5" />
          </Field>
        </div>

        {/* Toggle peso para flete + HS Code + overrides GA/IVA */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 mt-3">

          {/* Toggle peso volumétrico / bruto */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Peso para flete</label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={!p.usa_peso_bruto ? 'default' : 'outline'}
                className="h-7 text-xs px-2 gap-1"
                onClick={() => onChange({ usa_peso_bruto: false })}
              >
                <Box className="h-3 w-3" />
                Vol.{calc.peso_vol > 0 ? ` (${calc.peso_vol} kg)` : ''}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={p.usa_peso_bruto ? 'default' : 'outline'}
                className="h-7 text-xs px-2 gap-1"
                onClick={() => onChange({ usa_peso_bruto: true })}
              >
                <Weight className="h-3 w-3" />
                Bruto{p.peso_bruto ? ` (${p.peso_bruto} kg)` : ''}
              </Button>
            </div>
          </div>

          {/* HS Code */}
          <div className="space-y-1 w-28">
            <label className="text-xs text-muted-foreground">HS Code</label>
            <Input className="h-7 text-xs" value={p.hs_code || ''} onChange={s('hs_code')} placeholder="0000.00" />
          </div>

          {/* GA manual override */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={p.usa_ga_manual}
                onChange={e => onChange({ usa_ga_manual: e.target.checked })}
                className="rounded"
              />
              GA manual (Bs/unidad)
            </label>
            {p.usa_ga_manual && (
              <NumInput
                value={p.ga_manual}
                onChange={n('ga_manual')}
                min="0"
                step="0.01"
                placeholder={`auto: ${fmt(calc.ga_calculado)}`}
                className="w-28"
              />
            )}
            {!p.usa_ga_manual && (
              <p className="text-[10px] text-muted-foreground">Auto: Bs {fmt(calc.ga_calculado)}</p>
            )}
          </div>

          {/* IVA aduana manual override */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={p.usa_iva_manual}
                onChange={e => onChange({ usa_iva_manual: e.target.checked })}
                className="rounded"
              />
              IVA aduana manual (Bs/unidad)
            </label>
            {p.usa_iva_manual && (
              <NumInput
                value={p.iva_aduana_manual}
                onChange={n('iva_aduana_manual')}
                min="0"
                step="0.01"
                placeholder={`auto: ${fmt(calc.iva_aduana_calculado)}`}
                className="w-28"
              />
            )}
            {!p.usa_iva_manual && (
              <p className="text-[10px] text-muted-foreground">Auto: Bs {fmt(calc.iva_aduana_calculado)}</p>
            )}
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
      </div>

      {/* Resultados importación */}
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
          { label: 'Envío',       value: calc.envio,           hint: 'Bs/unidad' },
          {
            label: p.usa_ga_manual ? 'GA (manual)' : 'GA',
            value: calc.ga,
            hint: p.usa_ga_manual
              ? `Bs/unidad manual (auto = ${fmt(calc.ga_calculado)})`
              : 'Bs/unidad — calculado',
          },
          {
            label: p.usa_iva_manual ? 'IVA aduana (manual)' : 'IVA aduana',
            value: calc.iva_aduana,
            hint: p.usa_iva_manual
              ? `Bs/unidad manual (auto = ${fmt(calc.iva_aduana_calculado)})`
              : 'Bs/unidad — calculado',
          },
          { label: 'Manipuleo',   value: calc.manipuleo,       hint: 'Bs/unidad' },
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

      <Separator />

      {/* Sección LICITACIÓN */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Cotización licitación</p>

        {/* Precio ofertado — campo principal */}
        <div className="flex items-end gap-4 mb-4 flex-wrap">
          <div className="space-y-1 w-44">
            <label className="text-xs font-semibold">
              Precio entidad (referencial)
              <span className="ml-1 text-muted-foreground font-normal">— Bs/unidad</span>
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="h-9 font-mono text-base"
              value={p.precio_entidad ?? ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_entidad: e.target.value === '' ? undefined : (toDecimal(e.target.value) || 0) })}
            />
          </div>
          <div className="space-y-1 w-44">
            <label className="text-xs font-semibold">
              Precio ofertado (Bs/unidad)
              <span className="ml-1 text-muted-foreground font-normal">— editable</span>
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="h-9 font-mono font-semibold text-base"
              value={p.precio_ofertado || ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_ofertado: toDecimal(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Precio piso</p>
            <p className={`text-sm font-mono font-semibold ${p.precio_ofertado > 0 && p.precio_ofertado < calc.precio_piso ? 'text-amber-500' : 'text-muted-foreground'}`}>
              Bs {fmt(calc.precio_piso)}
            </p>
          </div>
          {p.precio_entidad != null && p.precio_entidad > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Vs. entidad</p>
              <p className={`text-sm font-mono font-semibold ${p.precio_ofertado > p.precio_entidad ? 'text-amber-600' : 'text-green-600 dark:text-green-400'}`}>
                {p.precio_ofertado > p.precio_entidad ? '+' : ''}{fmt(p.precio_ofertado - p.precio_entidad)}
                <span className="ml-1 font-normal">({((p.precio_ofertado / p.precio_entidad - 1) * 100).toFixed(1)}%)</span>
              </p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total ofertado</p>
            <p className="text-sm font-mono">Bs {fmt(calc.total_ofertado)}</p>
          </div>
        </div>

        {/* Costos adicionales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        {/* Resultados licitación */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          <ResultCard label="IVA a pagar"  value={calc.iva_pagar}      hint="13% ofertado − crédito fiscal aduana" />
          <ResultCard label="IT a pagar"   value={calc.it_pagar}       hint="3% del total ofertado" />
          <ResultCard label="Costos total" value={calc.costos}         hint="Costo import + IVA + IT + extras" bold />
          <ResultCard
            label="Ganancia"
            value={calc.ganancia}
            hint="Total ofertado − Costos"
            bold
            color={calc.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
          />
          <ResultCard
            label="ROI"
            value={calc.roi}
            isPct
            hint="Ganancia / Costos"
            color={calc.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
          />
        </div>
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
          <SummaryItem label="Costo import." value={r.total_import} />
          <SummaryItem label="Precio piso total" value={r.precio_piso_total} />
          <SummaryItem label="Total ofertado" value={r.total_ofertado} />
          <SummaryItem label="IVA a pagar" value={r.iva_pagar} />
          <SummaryItem label="IT a pagar" value={r.it_pagar} />
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

        {/* Desglose de costos por tipo de gasto (todos los productos) */}
        <div className="mt-3 pt-3 border-t">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Desglose de costos — todos los productos
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
