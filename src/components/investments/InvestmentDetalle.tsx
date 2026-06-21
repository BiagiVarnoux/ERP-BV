// src/components/investments/InvestmentDetalle.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Ship, Save, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportInvestmentAnalysisToPDF } from '@/services/pdfService';
import {
  InvestmentAnalysis, InvestmentItem, InvestmentEstado,
  INVESTMENT_ESTADO_LABELS, INVESTMENT_ESTADO_COLORS,
} from '@/accounting/investment-types';
import { calcItem, calcResumen, emptyItem } from '@/accounting/investment-utils';
import { InvestmentStorage } from '@/accounting/investment-storage';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { TabProductos } from './TabProductos';
import { TabTiempo } from './TabTiempo';
import { TabComparador } from './TabComparador';
import { EnviarEmbarqueDialog } from './EnviarEmbarqueDialog';

interface Props {
  analysis: InvestmentAnalysis;
  onBack: () => void;
  onUpdated: (a: InvestmentAnalysis) => void;
  onReload: () => Promise<void>;
}

const ESTADOS_ORDEN: InvestmentEstado[] = ['BORRADOR', 'APROBADO', 'DESCARTADO', 'EJECUTADO'];

export function InvestmentDetalle({ analysis, onBack, onUpdated, onReload }: Props) {
  const companyId = useActiveCompanyId();
  const [items, setItems] = useState<InvestmentItem[]>(analysis.items);
  const [costoCapital, setCostoCapital] = useState(analysis.costo_capital_anual);
  const [plazoImport, setPlazoImport] = useState(analysis.plazo_importacion_meses);
  const [saving, setSaving] = useState(false);
  const [embarqueOpen, setEmbarqueOpen] = useState(false);

  const calcs = useMemo(
    () => items.map(it => calcItem(it, plazoImport, costoCapital)),
    [items, plazoImport, costoCapital],
  );
  const resumen = useMemo(
    () => calcResumen({ ...analysis, items }, calcs),
    [analysis, items, calcs],
  );

  const isDirty =
    JSON.stringify(items) !== JSON.stringify(analysis.items) ||
    costoCapital !== analysis.costo_capital_anual ||
    plazoImport !== analysis.plazo_importacion_meses;

  // ── Edición de items ──────────────────────────────────────────────────────
  const updateItem = useCallback((id: string, changes: Partial<InvestmentItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...changes } : it));
  }, []);
  const addItem = useCallback(() => {
    setItems(prev => [...prev, emptyItem(analysis.id, prev.length)]);
  }, [analysis.id]);
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId) { toast.error('No hay empresa activa'); return; }
    try {
      setSaving(true);
      await InvestmentStorage.update(analysis.id, companyId, {
        costo_capital_anual:     costoCapital,
        plazo_importacion_meses: plazoImport,
      });
      await InvestmentStorage.upsertItems(companyId, items);
      const idsActuales = new Set(items.map(i => i.id));
      for (const old of analysis.items) {
        if (!idsActuales.has(old.id)) await InvestmentStorage.deleteItem(old.id, old.analysis_id);
      }
      onUpdated({ ...analysis, items, costo_capital_anual: costoCapital, plazo_importacion_meses: plazoImport });
      toast.success('Análisis guardado');
    } catch (e) {
      toast.error('Error al guardar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    if (items.length === 0) { toast.error('No hay productos para exportar'); return; }
    try {
      exportInvestmentAnalysisToPDF({
        analysis: {
          nombre:                  analysis.nombre,
          notas:                   analysis.notas,
          estado:                  INVESTMENT_ESTADO_LABELS[analysis.estado],
          costo_capital_anual:     costoCapital,
          plazo_importacion_meses: plazoImport,
        },
        items: items.map((it, i) => ({
          nombre:               it.nombre,
          cantidad:             it.cantidad,
          costo_unitario:       calcs[i].costeo.costo_unitario,
          inversion:            calcs[i].costeo.inversion,
          precio_con_factura:   it.precio_venta,
          precio_sin_factura:   it.precio_venta_sin_factura,
          cantidad_sin_factura: it.cantidad_sin_factura,
          ingreso_total:        calcs[i].costeo.ingreso_total,
          ganancia:             calcs[i].costeo.ganancia,
          roi:                  calcs[i].costeo.roi,
          ciclo_meses:          calcs[i].tiempo.ciclo_meses,
          roi_anualizado:       calcs[i].tiempo.roi_anualizado,
          meses_recuperacion:   calcs[i].tiempo.meses_recuperacion,
          van:                  calcs[i].tiempo.van,
          tir_anual:            calcs[i].tiempo.tir_anual,
        })),
        resumen,
      });
      toast.success('PDF generado');
    } catch (e) {
      toast.error('Error al generar el PDF');
      console.error(e);
    }
  };

  const handleEstadoChange = async (estado: InvestmentEstado) => {
    if (!companyId) return;
    try {
      await InvestmentStorage.update(analysis.id, companyId, { estado });
      onUpdated({ ...analysis, estado });
      toast.success(`Estado: ${INVESTMENT_ESTADO_LABELS[estado]}`);
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold truncate">{analysis.nombre}</h1>
            <Badge className={`shrink-0 text-xs ${INVESTMENT_ESTADO_COLORS[analysis.estado]}`}>
              {INVESTMENT_ESTADO_LABELS[analysis.estado]}
            </Badge>
            {analysis.embarque_id && (
              <Badge variant="outline" className="shrink-0 text-xs gap-1">
                <Ship className="h-3 w-3" /> Enviado a embarque
              </Badge>
            )}
          </div>
          {analysis.notas && <p className="text-sm text-muted-foreground mt-0.5">{analysis.notas}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportPDF}
            disabled={items.length === 0}
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setEmbarqueOpen(true)}
            disabled={items.length === 0}
          >
            <Ship className="h-3.5 w-3.5" /> Enviar a embarque
          </Button>
          <Select value={analysis.estado} onValueChange={v => handleEstadoChange(v as InvestmentEstado)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS_ORDEN.map(e => (
                <SelectItem key={e} value={e}>{INVESTMENT_ESTADO_LABELS[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="productos">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="productos">Productos &amp; Costeo</TabsTrigger>
          <TabsTrigger value="tiempo">Rentabilidad temporal</TabsTrigger>
          <TabsTrigger value="comparador">Comparador</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="mt-4">
          <TabProductos
            items={items}
            calcs={calcs}
            resumen={resumen}
            onUpdate={updateItem}
            onAdd={addItem}
            onRemove={removeItem}
          />
        </TabsContent>

        <TabsContent value="tiempo" className="mt-4">
          <TabTiempo
            items={items}
            calcs={calcs}
            resumen={resumen}
            costoCapital={costoCapital}
            plazoImport={plazoImport}
            onCostoCapital={setCostoCapital}
            onPlazoImport={setPlazoImport}
            onUpdateItem={updateItem}
          />
        </TabsContent>

        <TabsContent value="comparador" className="mt-4">
          <TabComparador items={items} calcs={calcs} />
        </TabsContent>
      </Tabs>

      {/* Barra de guardado flotante */}
      {isDirty && (
        <div className="sticky bottom-4 flex justify-end gap-2">
          <div className="flex gap-2 bg-background/95 backdrop-blur border rounded-lg p-2 shadow-lg">
            <Button
              variant="outline"
              onClick={() => {
                setItems(analysis.items);
                setCostoCapital(analysis.costo_capital_anual);
                setPlazoImport(analysis.plazo_importacion_meses);
              }}
            >
              Descartar cambios
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar análisis'}
            </Button>
          </div>
        </div>
      )}

      <EnviarEmbarqueDialog
        open={embarqueOpen}
        onClose={() => setEmbarqueOpen(false)}
        analysis={{ ...analysis, items }}
        calcs={calcs}
        onSent={async (embarqueId) => {
          if (companyId) {
            await InvestmentStorage.update(analysis.id, companyId, { embarque_id: embarqueId, estado: 'EJECUTADO' });
            onUpdated({ ...analysis, items, embarque_id: embarqueId, estado: 'EJECUTADO' });
          }
          setEmbarqueOpen(false);
          await onReload();
        }}
      />
    </div>
  );
}
