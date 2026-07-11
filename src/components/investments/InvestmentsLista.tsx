// src/components/investments/InvestmentsLista.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, TrendingUp, Trash2, Calculator, ListChecks, X, Layers } from 'lucide-react';
import {
  InvestmentAnalysis, INVESTMENT_ESTADO_LABELS, INVESTMENT_ESTADO_COLORS,
} from '@/accounting/investment-types';
import { calcItem, calcResumen } from '@/accounting/investment-utils';
import { fmt } from '@/accounting/utils';
import { NuevoAnalisisModal } from './NuevoAnalisisModal';
import { InvestmentsConsolidado } from './InvestmentsConsolidado';

interface Props {
  analyses: InvestmentAnalysis[];
  loading: boolean;
  companyId: string | undefined;
  onCreated: (a: InvestmentAnalysis) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

export function InvestmentsLista({ analyses, loading, companyId, onCreated, onDelete, onOpen }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<InvestmentAnalysis | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConsolidado, setShowConsolidado] = useState(false);

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const seleccionadas = analyses.filter(a => selectedIds.has(a.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Análisis de Inversión
          </h1>
          <p className="text-sm text-muted-foreground">
            Evaluación de importaciones: rentabilidad, ciclo de caja, VAN y TIR.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={toggleSelectMode} className="gap-2">
            {selectMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </Button>
          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo análisis
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-20 text-center text-muted-foreground">Cargando...</div>
      ) : analyses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">Aún no tienes análisis de inversión.</p>
            <Button onClick={() => setModalOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Crear el primero
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analyses.map(a => (
            <Card
              key={a.id}
              className={`cursor-pointer hover:border-primary/50 transition-colors group ${selectedIds.has(a.id) ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => selectMode ? toggleSelected(a.id) : onOpen(a.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelected(a.id)}
                      onClick={e => e.stopPropagation()}
                      className="shrink-0 h-4 w-4 rounded mt-0.5"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.nombre || 'Sin nombre'}</p>
                    {a.notas && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.notas}</p>}
                  </div>
                  <Badge className={`shrink-0 text-xs ${INVESTMENT_ESTADO_COLORS[a.estado]}`}>
                    {INVESTMENT_ESTADO_LABELS[a.estado]}
                  </Badge>
                </div>
                <AnalysisStats analysis={a} />
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>Capital: {a.costo_capital_anual}% · Imp.: {a.plazo_importacion_meses}m</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={e => { e.stopPropagation(); setToDelete(a); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Barra flotante de selección */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border bg-background shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
          <Button size="sm" className="gap-2" onClick={() => setShowConsolidado(true)}>
            <Layers className="h-3.5 w-3.5" />
            Ver consolidado
          </Button>
        </div>
      )}

      {showConsolidado && (
        <InvestmentsConsolidado
          analyses={seleccionadas}
          onClose={() => setShowConsolidado(false)}
        />
      )}

      <NuevoAnalisisModal
        open={modalOpen}
        companyId={companyId}
        onClose={() => setModalOpen(false)}
        onCreated={a => { setModalOpen(false); onCreated(a); }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={o => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar análisis?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{toDelete?.nombre}" y todos sus productos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (toDelete) onDelete(toDelete.id); setToDelete(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AnalysisStats({ analysis: a }: { analysis: InvestmentAnalysis }) {
  if (a.items.length === 0) {
    return <p className="text-xs text-muted-foreground mt-3">Sin productos</p>;
  }
  const calcs = a.items.map(it => calcItem(it, a.plazo_importacion_meses, a.costo_capital_anual, a.fuc_pct, a.tc_oficial));
  const r = calcResumen(a, calcs);
  const roiPct = (r.roi * 100).toFixed(1);
  const roiColor = r.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400';
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 mb-1">
      <div>
        <p className="text-[10px] text-muted-foreground">Inversión</p>
        <p className="text-xs font-mono font-medium">Bs {fmt(r.inversion)}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Ganancia</p>
        <p className={`text-xs font-mono font-medium ${r.ganancia < 0 ? 'text-red-500' : ''}`}>Bs {fmt(r.ganancia)}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">ROI · {a.items.length} prod.</p>
        <p className={`text-xs font-mono font-semibold ${roiColor}`}>{roiPct}%</p>
      </div>
    </div>
  );
}
