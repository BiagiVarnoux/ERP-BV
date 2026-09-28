// src/components/investments/CopyItemFromAnalysisDialog.tsx
// Copia uno o varios productos DESDE otro análisis de inversión hacia el actual.
// Trae todos los datos de costeo del producto (precio, flete, tributos, extras,
// venta/tiempo). El destino les asigna id nuevo y los agrega; ver
// InvestmentDetalle.copyItems. No persiste solo: el usuario guarda el análisis.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Copy, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import { InvestmentStorage } from '@/accounting/investment-storage';
import { InvestmentAnalysis, InvestmentItem } from '@/accounting/investment-types';
import { fmt } from '@/accounting/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Análisis actual: se excluye de la lista de orígenes. */
  excludeAnalysisId: string;
  /** Devuelve los productos elegidos (tal cual del origen) para que el destino los mapee. */
  onCopy: (items: InvestmentItem[]) => void;
}

export function CopyItemFromAnalysisDialog({
  open, onOpenChange, companyId, excludeAnalysisId, onCopy,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [analyses, setAnalyses] = useState<InvestmentAnalysis[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Carga los análisis (con sus productos) al abrir. loadAll ya trae los items.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const data = await InvestmentStorage.loadAll(companyId);
        if (cancel) return;
        const others = data.filter(a => a.id !== excludeAnalysisId && a.items.length > 0);
        setAnalyses(others);
        setSourceId(others[0]?.id ?? null);
      } catch (e) {
        if (!cancel) { toast.error('No se pudieron cargar los análisis'); console.error(e); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, companyId, excludeAnalysisId]);

  // Al cerrar, limpia la selección para no arrastrarla a la próxima apertura.
  useEffect(() => {
    if (!open) { setSelectedItemIds(new Set()); }
  }, [open]);

  const source = useMemo(
    () => analyses.find(a => a.id === sourceId) ?? null,
    [analyses, sourceId],
  );

  // Cambiar de análisis origen reinicia la selección.
  const handleSourceChange = (id: string) => {
    setSourceId(id);
    setSelectedItemIds(new Set());
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allChecked = !!source && source.items.length > 0 && source.items.every(it => selectedItemIds.has(it.id));
  const toggleAll = () => {
    if (!source) return;
    setSelectedItemIds(allChecked ? new Set() : new Set(source.items.map(it => it.id)));
  };

  const handleCopy = () => {
    if (!source) return;
    const chosen = source.items.filter(it => selectedItemIds.has(it.id));
    if (chosen.length === 0) { toast.error('Elegí al menos un producto'); return; }
    onCopy(chosen);
    toast.success(
      chosen.length === 1 ? 'Producto copiado' : `${chosen.length} productos copiados`,
      { description: 'Revisá y guardá el análisis para conservarlos.' },
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copiar producto de otro análisis</DialogTitle>
          <DialogDescription>
            Trae los productos con todos sus datos de costeo. Podés ajustarlos y luego guardar.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Cargando análisis…</div>
        ) : analyses.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <PackageSearch className="h-6 w-6 opacity-60" />
            No hay otros análisis con productos para copiar.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Análisis origen</label>
              <Select value={sourceId ?? undefined} onValueChange={handleSourceChange}>
                <SelectTrigger><SelectValue placeholder="Elegí un análisis" /></SelectTrigger>
                <SelectContent>
                  {analyses.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre} · {a.items.length} prod.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {source && (
              <div className="rounded-lg border">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} id="copy-all" />
                  <label htmlFor="copy-all" className="text-xs font-medium cursor-pointer select-none">
                    Seleccionar todos
                  </label>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {selectedItemIds.size} de {source.items.length}
                  </span>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="divide-y">
                    {source.items.map(it => {
                      const checked = selectedItemIds.has(it.id);
                      return (
                        <label
                          key={it.id}
                          className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleItem(it.id)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{it.nombre || 'Sin nombre'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {it.cantidad} u · {fmt(it.precio_usd)} USD
                              {it.especificacion ? ` · ${it.especificacion}` : ''}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleCopy}
            disabled={loading || selectedItemIds.size === 0}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Copiar {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
