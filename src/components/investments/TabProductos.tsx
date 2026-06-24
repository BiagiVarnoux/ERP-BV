// src/components/investments/TabProductos.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Plus, Trash2, ChevronDown, ChevronRight, ExternalLink, AlertTriangle,
  TrendingUp, TrendingDown, Box, Weight, GripVertical,
} from 'lucide-react';
import { InvestmentItem, ItemCalc, InvestmentResumen } from '@/accounting/investment-types';
import { fmt, toDecimal, round2 } from '@/accounting/utils';
import { NumInput, Pct, Field, StatCard } from './ui-helpers';

interface Props {
  items: InvestmentItem[];
  calcs: ItemCalc[];
  resumen: InvestmentResumen;
  onUpdate: (id: string, changes: Partial<InvestmentItem>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReorder: (items: InvestmentItem[]) => void;
}

export function TabProductos({ items, calcs, resumen, onUpdate, onAdd, onRemove, onReorder }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const toggle = (id: string) => setExpandedIds(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (idx !== dragIdx) setOverIdx(idx);
  }
  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onReorder(reordered);
    setDragIdx(null);
    setOverIdx(null);
  }
  function handleDragEnd() { setDragIdx(null); setOverIdx(null); }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg">
            <p className="mb-3">No hay productos en este análisis</p>
            <Button variant="outline" size="sm" onClick={() => { onAdd(); }} className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Agregar producto
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border divide-y overflow-hidden">
            {items.map((it, i) => (
              <div
                key={it.id}
                className="drag-row"
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={e => { (e.currentTarget as HTMLElement).draggable = false; handleDragEnd(); }}
                style={{
                  opacity: dragIdx === i ? 0.4 : 1,
                  borderTop: overIdx === i && dragIdx !== i ? '2px solid hsl(var(--primary))' : undefined,
                  transition: 'opacity 0.15s',
                }}
              >
                <ItemRow
                  item={it}
                  calc={calcs[i]}
                  expanded={expandedIds.has(it.id)}
                  onToggle={() => toggle(it.id)}
                  onChange={c => onUpdate(it.id, c)}
                  onRemove={() => onRemove(it.id)}
                  showDragHandle
                />
              </div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={onAdd} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Agregar producto
          </Button>
        )}

        {items.length > 0 && <ResumenCard resumen={resumen} count={items.length} />}
      </div>
    </TooltipProvider>
  );
}

// ─── Fila de producto ─────────────────────────────────────────────────────────

function ItemRow({ item: p, calc, expanded, onToggle, onChange, onRemove, showDragHandle }: {
  item: InvestmentItem;
  calc: ItemCalc;
  expanded: boolean;
  onToggle: () => void;
  onChange: (c: Partial<InvestmentItem>) => void;
  onRemove: () => void;
  showDragHandle?: boolean;
}) {
  const { costeo } = calc;
  const sinFactura = p.modalidad_venta === 'sin_factura';
  const precioActivo = sinFactura ? p.precio_venta_sin_factura : p.precio_venta;
  const pisoActivo = sinFactura ? costeo.precio_piso_sf : costeo.precio_piso;
  const isUnprofitable = costeo.ganancia < 0;
  const isBelowFloor = precioActivo > 0 && precioActivo < pisoActivo;

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${isUnprofitable ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
          {showDragHandle && (
            <span
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => {
                e.stopPropagation();
                const row = (e.currentTarget as HTMLElement).closest('.drag-row') as HTMLElement | null;
                if (row) row.draggable = true;
              }}
              title="Arrastra para reordenar"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {p.nombre || <span className="italic text-muted-foreground">Sin nombre</span>}
              </span>
              {p.link_producto && /^https?:\/\//i.test(p.link_producto) && (
                <a href={p.link_producto} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </a>
              )}
              {isBelowFloor && (
                <Tooltip>
                  <TooltipTrigger asChild><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /></TooltipTrigger>
                  <TooltipContent>Precio de venta por debajo del precio piso</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Q: {p.cantidad} · USD {fmt(p.precio_usd ?? 0)} · T/C {p.tc}
            </div>
          </div>

          <div className="hidden md:flex flex-col items-end shrink-0">
            <span className="text-[10px] text-muted-foreground">Costo unit.</span>
            <span className="text-sm font-mono text-muted-foreground">Bs {fmt(costeo.costo_unitario)}</span>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] text-muted-foreground">Venta {sinFactura ? 's/f' : 'c/f'}</span>
            <span className="text-sm font-mono font-medium">Bs {fmt(precioActivo)}</span>
          </div>
          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="text-[10px] text-muted-foreground">Ganancia</span>
            <span className={`text-sm font-mono flex items-center gap-1 ${isUnprofitable ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
              {isUnprofitable ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              Bs {fmt(costeo.ganancia)}
            </span>
          </div>
          <div className="hidden lg:flex flex-col items-end shrink-0 w-14">
            <span className="text-[10px] text-muted-foreground">ROI</span>
            <span className={`text-sm font-mono ${isUnprofitable ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
              <Pct v={costeo.roi} />
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

      <CollapsibleContent>
        <div className="px-4 pb-5 pt-1 bg-muted/20 border-t">
          <ItemForm item={p} calc={calc} onChange={onChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Formulario detallado ──────────────────────────────────────────────────────

function ItemForm({ item: p, calc, onChange }: {
  item: InvestmentItem;
  calc: ItemCalc;
  onChange: (c: Partial<InvestmentItem>) => void;
}) {
  const { costeo } = calc;
  const n = (k: keyof InvestmentItem) => (v: number | undefined) => onChange({ [k]: v });
  const s = (k: keyof InvestmentItem) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [k]: e.target.value });

  return (
    <div className="space-y-5 pt-3">
      {/* Descripción */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre del producto</label>
          <Input className="h-7 text-xs" value={p.nombre} onChange={s('nombre')} placeholder="Ej: SSD 512GB" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Especificación</label>
          <Input className="h-7 text-xs" value={p.especificacion || ''} onChange={s('especificacion')} placeholder="Ej: NVMe / M.2" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Link del producto</label>
          <Input className="h-7 text-xs" value={p.link_producto || ''} onChange={s('link_producto')} placeholder="https://..." />
        </div>
      </div>

      <Separator />

      {/* Costo de importación */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Costo de importación</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-3">
          <Field label="Cantidad"><NumInput value={p.cantidad} onChange={n('cantidad')} min="1" step="1" /></Field>
          <Field label="Precio USD"><NumInput value={p.precio_usd} onChange={n('precio_usd')} min="0" step="0.001" /></Field>
          <Field label="Tax prov. %"><NumInput value={p.tax_pct} onChange={n('tax_pct')} min="0" /></Field>
          <Field label="T/C compra"><NumInput value={p.tc} onChange={n('tc')} min="0" /></Field>
          <Field label="T/C envío"><NumInput value={p.tc_envio} onChange={n('tc_envio')} min="0" placeholder="= compra" /></Field>
          <Field label="GA %" hint="Gravamen"><NumInput value={p.ga_pct} onChange={n('ga_pct')} min="0" /></Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-3 mt-3">
          <Field label="M1 (cm)"><NumInput value={p.m1} onChange={n('m1')} min="0" step="0.1" /></Field>
          <Field label="M2 (cm)"><NumInput value={p.m2} onChange={n('m2')} min="0" step="0.1" /></Field>
          <Field label="M3 (cm)"><NumInput value={p.m3} onChange={n('m3')} min="0" step="0.1" /></Field>
          <Field label="Peso bruto (kg)"><NumInput value={p.peso_bruto} onChange={n('peso_bruto')} min="0" step="0.001" /></Field>
          <Field label="Tarifa envío $/kg"><NumInput value={p.tarifa_envio} onChange={n('tarifa_envio')} min="0" step="0.5" /></Field>
          <Field label="Manipuleo Bs/kg"><NumInput value={p.tarifa_manipuleo} onChange={n('tarifa_manipuleo')} min="0" step="0.5" /></Field>
        </div>

        {/* Toggle peso + batería */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 mt-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Peso para flete</label>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant={!p.usa_peso_bruto ? 'default' : 'outline'} className="h-7 text-xs px-2 gap-1" onClick={() => onChange({ usa_peso_bruto: false })}>
                <Box className="h-3 w-3" /> Vol.{costeo.peso_vol > 0 ? ` (${costeo.peso_vol} kg)` : ''}
              </Button>
              <Button type="button" size="sm" variant={p.usa_peso_bruto ? 'default' : 'outline'} className="h-7 text-xs px-2 gap-1" onClick={() => onChange({ usa_peso_bruto: true })}>
                <Weight className="h-3 w-3" /> Bruto{p.peso_bruto ? ` (${p.peso_bruto} kg)` : ''}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer mt-5">
            <input type="checkbox" checked={p.tiene_bateria} onChange={e => onChange({ tiene_bateria: e.target.checked })} className="rounded" />
            Tiene batería
          </label>
          {p.tiene_bateria && (
            <Field label="Costo batería (Bs)" className="w-32"><NumInput value={p.costo_bateria} onChange={n('costo_bateria')} min="0" /></Field>
          )}
        </div>

        {/* Resultados costeo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <StatCard label="Precio Bs" value={costeo.precio_bs} hint="(USD + tax) × T/C" />
          <StatCard label="Envío" value={costeo.envio} hint="peso × tarifa × T/C envío" />
          <StatCard label="GA" value={costeo.ga} hint="Gravamen arancelario" />
          <StatCard label="IVA aduana" value={costeo.iva_aduana} hint="Crédito fiscal (recuperable) — no es costo contable del inventario" />
          <StatCard label="Manipuleo" value={costeo.manipuleo} />
          <StatCard label="Costo unit. CON IVA" value={costeo.costo_unitario} bold hint="Desembolso total por unidad, IVA aduana incluido" />
          <StatCard label="Costo unit. SIN IVA" value={costeo.costo_unitario_sin_iva} bold hint="Costo contable del inventario — el que va a libros y al COGS real del embarque" />
          <StatCard label="Inversión" value={costeo.inversion} bold hint="Capital comprometido = costo import. × cantidad + extras" />
          <StatCard label="Precio piso" value={costeo.precio_piso} hint="Venta mínima para no perder" />
        </div>
      </div>

      <Separator />

      {/* Venta esperada */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Venta esperada</p>

        {/* Modalidad de venta — decide qué precio maneja el análisis */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Vender:</span>
          <Button
            type="button" size="sm"
            variant={p.modalidad_venta === 'con_factura' ? 'default' : 'outline'}
            className="h-7 text-xs px-3"
            onClick={() => onChange({ modalidad_venta: 'con_factura' })}
          >
            Con factura
          </Button>
          <Button
            type="button" size="sm"
            variant={p.modalidad_venta === 'sin_factura' ? 'default' : 'outline'}
            className="h-7 text-xs px-3"
            onClick={() => onChange({ modalidad_venta: 'sin_factura' })}
          >
            Sin factura
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-3">
          <div className="space-y-1 w-40">
            <label className="text-xs font-semibold">
              Precio CON factura {p.modalidad_venta === 'con_factura' && <span className="text-primary">●</span>}
            </label>
            <Input
              type="number" min="0" step="0.01"
              className={`h-9 font-mono font-semibold text-base ${p.modalidad_venta === 'con_factura' ? 'ring-2 ring-primary/40' : 'opacity-70'}`}
              value={p.precio_venta || ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_venta: toDecimal(e.target.value) || 0 })}
            />
            {costeo.precio_con_factura_sugerido > 0 && (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline text-left w-full"
                onClick={() => onChange({ precio_venta: costeo.precio_con_factura_sugerido })}
                title="Igualar la ganancia por unidad a la venta sin factura"
              >
                Sugerido: Bs {fmt(costeo.precio_con_factura_sugerido)} (usar)
              </button>
            )}
          </div>
          <div className="space-y-1 w-40">
            <label className="text-xs font-semibold">
              Precio SIN factura {p.modalidad_venta === 'sin_factura' && <span className="text-primary">●</span>}
            </label>
            <Input
              type="number" min="0" step="0.01"
              className={`h-9 font-mono font-semibold text-base ${p.modalidad_venta === 'sin_factura' ? 'ring-2 ring-primary/40' : 'opacity-70'}`}
              value={p.precio_venta_sin_factura || ''}
              placeholder="0.00"
              onChange={e => onChange({ precio_venta_sin_factura: toDecimal(e.target.value) || 0 })}
            />
          </div>
          <Field label="Velocidad de venta" hint="uds/mes" className="w-28">
            <NumInput value={p.velocidad_venta || undefined} onChange={n('velocidad_venta')} min="0" step="1" placeholder="uds/mes" />
          </Field>
          <Field label="Plazo venta override" hint="meses" className="w-28">
            <NumInput value={p.meses_venta_override} onChange={n('meses_venta_override')} min="0" step="0.5" placeholder="auto" />
          </Field>
        </div>

        {/* Comparación de ganancia por unidad: con vs sin factura (siempre ambas) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatCard
            label="Ganancia/u con factura"
            value={round2(0.84 * p.precio_venta - costeo.costo_unitario + costeo.iva_aduana)}
            hint="0,84 × precio c/f − costo unitario + crédito IVA aduana"
          />
          <StatCard
            label="Ganancia/u sin factura"
            value={round2(p.precio_venta_sin_factura - costeo.costo_unitario)}
            hint="Precio sin factura − costo unitario (sin impuestos de venta)"
          />
          <StatCard
            label="Total venta"
            value={costeo.ingreso_total}
            bold
            hint={p.modalidad_venta === 'sin_factura' ? 'Venta sin factura de todo el lote' : 'Venta con factura de todo el lote'}
          />
          <StatCard
            label={p.modalidad_venta === 'sin_factura' ? 'Piso s/factura' : 'Piso c/factura'}
            value={p.modalidad_venta === 'sin_factura' ? costeo.precio_piso_sf : costeo.precio_piso}
            hint="Venta mínima por unidad para no perder"
          />
        </div>

        {/* Costos adicionales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Garantía (Bs)"><NumInput value={p.garantia || undefined} onChange={n('garantia')} min="0" /></Field>
          <Field label="Pasaje (Bs)"><NumInput value={p.pasaje || undefined} onChange={n('pasaje')} min="0" /></Field>
          <Field label="Envío local (Bs)"><NumInput value={p.envio_local || undefined} onChange={n('envio_local')} min="0" /></Field>
          <Field label="Otros costos (Bs)"><NumInput value={p.otros_costos || undefined} onChange={n('otros_costos')} min="0" /></Field>
        </div>

        {/* Resultados rentabilidad */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          <StatCard label="IVA a pagar" value={costeo.iva_pagar} hint="13% venta − crédito IVA aduana" />
          <StatCard label="IT a pagar" value={costeo.it_pagar} hint="3% de la venta" />
          <StatCard label="Costos total" value={costeo.costos} bold />
          <StatCard label="Ganancia" value={costeo.ganancia} bold color={costeo.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
          <StatCard label="ROI" value={costeo.roi} isPct hint="Ganancia / Inversión" color={costeo.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
        </div>
      </div>
    </div>
  );
}

// ─── Resumen global ────────────────────────────────────────────────────────────

function ResumenCard({ resumen: r, count }: { resumen: InvestmentResumen; count: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Resumen — {count} producto{count !== 1 ? 's' : ''}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Inversión total" value={`Bs ${fmt(r.inversion)}`} bold />
          <Stat label="Ingreso total" value={`Bs ${fmt(r.ingreso_total)}`} />
          <Stat label="Costos totales" value={`Bs ${fmt(r.costos)}`} />
          <Stat label="Ganancia" value={`Bs ${fmt(r.ganancia)}`} bold color={r.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
          <Stat label="ROI" value={`${(r.roi * 100).toFixed(1)}%`} bold color={r.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>{value}</p>
    </div>
  );
}
