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
import { TC_OFICIAL } from '@/accounting/licitacion-utils';
import { InvestmentStorage } from '@/accounting/investment-storage';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { TabProductos } from './TabProductos';
import { TabTiempo } from './TabTiempo';
import { TabComparador } from './TabComparador';
import { TabEmbarque } from './TabEmbarque';

interface Props {
  analysis: InvestmentAnalysis;
  onBack: () => void;
  onUpdated: (a: InvestmentAnalysis) => void;
  onReload: () => Promise<void>;
}

const ESTADOS_ORDEN: InvestmentEstado[] = ['BORRADOR', 'APROBADO', 'DESCARTADO', 'EJECUTADO'];

export function InvestmentDetalle({ analysis, onBack, onUpdated }: Props) {
  const companyId = useActiveCompanyId();
  const [items, setItems] = useState<InvestmentItem[]>(analysis.items);
  const [costoCapital, setCostoCapital] = useState(analysis.costo_capital_anual);
  const [plazoImport, setPlazoImport] = useState(analysis.plazo_importacion_meses);
  const [fuc, setFuc] = useState(analysis.fuc_pct);
  const [tcOficial, setTcOficial] = useState<number>(analysis.tc_oficial ?? TC_OFICIAL);
  // T/C de compra y envío a nivel de análisis: se aplican en bloque a todos los productos.
  const [headerTcCompra, setHeaderTcCompra] = useState<number>(analysis.items[0]?.tc ?? 9.97);
  const [headerTcEnvio, setHeaderTcEnvio]   = useState<number | undefined>(analysis.items[0]?.tc_envio);
  const [embarqueId, setEmbarqueId] = useState(analysis.embarque_id);
  const [nombre, setNombre] = useState(analysis.nombre);
  const [saving, setSaving] = useState(false);

  const calcs = useMemo(
    () => items.map(it => calcItem(it, plazoImport, costoCapital, fuc, tcOficial)),
    [items, plazoImport, costoCapital, fuc, tcOficial],
  );
  const resumen = useMemo(
    () => calcResumen({ ...analysis, items, fuc_pct: fuc }, calcs),
    [analysis, items, calcs, fuc],
  );

  const isDirty =
    nombre !== analysis.nombre ||
    JSON.stringify(items) !== JSON.stringify(analysis.items) ||
    costoCapital !== analysis.costo_capital_anual ||
    plazoImport !== analysis.plazo_importacion_meses ||
    fuc !== analysis.fuc_pct ||
    tcOficial !== (analysis.tc_oficial ?? TC_OFICIAL) ||
    (embarqueId ?? null) !== (analysis.embarque_id ?? null);

  // ── Edición de items ──────────────────────────────────────────────────────
  const updateItem = useCallback((id: string, changes: Partial<InvestmentItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...changes } : it));
  }, []);
  const addItem = useCallback(() => {
    // Los productos nuevos heredan el T/C de compra/envío definido en la cabecera.
    setItems(prev => [...prev, { ...emptyItem(analysis.id, prev.length), tc: headerTcCompra, tc_envio: headerTcEnvio }]);
  }, [analysis.id, headerTcCompra, headerTcEnvio]);

  // Aplica un T/C a TODOS los productos del análisis de una sola vez.
  const applyTcCompraAll = useCallback((v: number | undefined) => {
    const val = v ?? 0;
    setHeaderTcCompra(val);
    setItems(prev => prev.map(it => ({ ...it, tc: val })));
  }, []);
  const applyTcEnvioAll = useCallback((v: number | undefined) => {
    setHeaderTcEnvio(v);
    setItems(prev => prev.map(it => ({ ...it, tc_envio: v })));
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);
  const reorderItems = useCallback((reordered: InvestmentItem[]) => {
    setItems(reordered.map((it, i) => ({ ...it, orden: i })));
  }, []);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId) { toast.error('No hay empresa activa'); return; }
    try {
      setSaving(true);
      await InvestmentStorage.update(analysis.id, companyId, {
        nombre,
        costo_capital_anual:     costoCapital,
        plazo_importacion_meses: plazoImport,
        fuc_pct:                 fuc,
        tc_oficial:              tcOficial,
        embarque_id:             embarqueId ?? null,
      });
      await InvestmentStorage.upsertItems(companyId, items);
      const idsActuales = new Set(items.map(i => i.id));
      for (const old of analysis.items) {
        if (!idsActuales.has(old.id)) await InvestmentStorage.deleteItem(old.id, old.analysis_id);
      }
      onUpdated({ ...analysis, nombre, items, costo_capital_anual: costoCapital, plazo_importacion_meses: plazoImport, fuc_pct: fuc, tc_oficial: tcOficial, embarque_id: embarqueId });
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
          modalidad:            it.modalidad_venta,
          cantidad:             it.cantidad,
          costo_unitario:       calcs[i].costeo.costo_unitario,
          inversion:            calcs[i].costeo.inversion,
          precio_con_factura:   it.precio_venta,
          precio_sin_factura:   it.precio_venta_sin_factura,
          ingreso_total:        calcs[i].costeo.ingreso_total,
          ganancia:             calcs[i].costeo.ganancia,
          roi:                  calcs[i].costeo.roi,
          ciclo_meses:          calcs[i].tiempo.ciclo_meses,
          roi_anualizado:       calcs[i].tiempo.roi_anualizado,
          roi_anualizado_realista: calcs[i].tiempo.roi_anualizado_realista,
          meses_recuperacion:   calcs[i].tiempo.meses_recuperacion,
          van:                  calcs[i].tiempo.van,
          tir_anual:            calcs[i].tiempo.tir_anual,
        })),
        resumen: { ...resumen, fuc_pct: fuc },
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
            <input
              className="text-xl font-bold bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none rounded-sm px-0.5 -mx-0.5 w-full min-w-0 transition-colors"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="Nombre del análisis"
              title="Clic para editar el nombre"
            />
            <Badge className={`shrink-0 text-xs ${INVESTMENT_ESTADO_COLORS[analysis.estado]}`}>
              {INVESTMENT_ESTADO_LABELS[analysis.estado]}
            </Badge>
            {embarqueId && (
              <Badge variant="outline" className="shrink-0 text-xs gap-1">
                <Ship className="h-3 w-3" /> Embarque vinculado
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
          <TabsTrigger value="embarque">Embarque</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="mt-4">
          <TabProductos
            items={items}
            calcs={calcs}
            resumen={resumen}
            tcOficial={tcOficial}
            onTcOficial={setTcOficial}
            headerTcCompra={headerTcCompra}
            headerTcEnvio={headerTcEnvio}
            onTcCompraAll={applyTcCompraAll}
            onTcEnvioAll={applyTcEnvioAll}
            onUpdate={updateItem}
            onAdd={addItem}
            onRemove={removeItem}
            onReorder={reorderItems}
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
            fuc={fuc}
            onFuc={setFuc}
            onUpdateItem={updateItem}
          />
        </TabsContent>

        <TabsContent value="comparador" className="mt-4">
          <TabComparador items={items} calcs={calcs} />
        </TabsContent>

        <TabsContent value="embarque" className="mt-4">
          <TabEmbarque
            items={items}
            calcs={calcs}
            companyId={companyId}
            embarqueId={embarqueId}
            onEmbarqueId={setEmbarqueId}
            onUpdateItem={updateItem}
          />
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
                setFuc(analysis.fuc_pct);
                setTcOficial(analysis.tc_oficial ?? TC_OFICIAL);
                setHeaderTcCompra(analysis.items[0]?.tc ?? 9.97);
                setHeaderTcEnvio(analysis.items[0]?.tc_envio);
                setEmbarqueId(analysis.embarque_id);
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

    </div>
  );
}
