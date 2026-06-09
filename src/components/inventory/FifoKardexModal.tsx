import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, TrendingDown, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { fmt, round2 } from '@/accounting/utils';
import { InventoryLot, calcularEstadoFifo } from './fifo-utils';
import { FifoExitModal } from './FifoExitModal';
import type { InventoryMovement } from './inventory-utils';

interface FifoKardexModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; nombre: string; codigo: string; unidad_medida: string };
  isReadOnly?: boolean;
  onSaved?: () => void;
}

export function FifoKardexModal({ isOpen, onClose, product, isReadOnly, onSaved }: FifoKardexModalProps) {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [movs, setMovs] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExit, setShowExit] = useState(false);
  const activeCompanyId = useActiveCompanyId();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: lotsData }, { data: movsData }] = await Promise.all([
        supabase.from('inventory_lots').select('*').eq('product_id', product.id).eq('company_id', activeCompanyId).order('fecha_ingreso', { ascending: true }),
        supabase.from('inventory_movements').select('*').eq('product_id', product.id).eq('company_id', activeCompanyId).order('fecha', { ascending: true }),
      ]);
      setLots((lotsData ?? []) as InventoryLot[]);
      setMovs((movsData ?? []) as InventoryMovement[]);
    } finally {
      setLoading(false);
    }
  }, [product.id, activeCompanyId]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const state = calcularEstadoFifo(lots);
  const fifoMovs = movs.filter(m => m.metodo_valuacion === 'FIFO');

  function handleExitSaved() {
    loadData();
    onSaved?.();
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Kárdex FIFO — {product.codigo} {product.nombre}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Cargando...</p>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Saldo Total</p>
                <p className="text-lg font-bold">{state.saldo_total} {product.unidad_medida}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-lg font-bold">Bs {fmt(state.saldo_valorado)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Lotes Activos</p>
                <p className="text-lg font-bold">{state.lotes_activos}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Próximo Costo Salida</p>
                <p className="text-lg font-bold">Bs {fmt(state.costo_siguiente_salida)}</p>
              </Card>
            </div>

            {!isReadOnly && state.saldo_total > 0 && (
              <Button onClick={() => setShowExit(true)} variant="outline" size="sm">
                <TrendingDown className="w-4 h-4 mr-2" /> Registrar Salida FIFO
              </Button>
            )}

            <Tabs defaultValue="lotes">
              <TabsList>
                <TabsTrigger value="lotes">Lotes</TabsTrigger>
                <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
              </TabsList>

              <TabsContent value="lotes">
                {lots.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay lotes registrados.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha Ingreso</TableHead>
                        <TableHead className="text-right">C.U. (Bs)</TableHead>
                        <TableHead className="text-right">Inicial</TableHead>
                        <TableHead className="text-right">Disponible</TableHead>
                        <TableHead className="text-right">Consumido</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lots.map(l => {
                        const consumido = round2(l.cantidad_inicial - l.cantidad_disponible);
                        const activo = l.cantidad_disponible > 0;
                        return (
                          <TableRow key={l.id} className={!activo ? 'opacity-60' : ''}>
                            <TableCell>{l.fecha_ingreso}</TableCell>
                            <TableCell className="text-right">{fmt(l.costo_unitario)}</TableCell>
                            <TableCell className="text-right">{l.cantidad_inicial}</TableCell>
                            <TableCell className="text-right">{l.cantidad_disponible}</TableCell>
                            <TableCell className="text-right">{consumido}</TableCell>
                            <TableCell>
                              <Badge variant={activo ? 'default' : 'secondary'}>
                                {activo ? 'Activo' : 'Agotado'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold">
                        <TableCell>Totales</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{lots.reduce((s, l) => s + l.cantidad_inicial, 0)}</TableCell>
                        <TableCell className="text-right">{lots.reduce((s, l) => s + l.cantidad_disponible, 0)}</TableCell>
                        <TableCell className="text-right">{round2(lots.reduce((s, l) => s + (l.cantidad_inicial - l.cantidad_disponible), 0))}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="movimientos">
                {fifoMovs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay movimientos FIFO.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead className="text-right">Entradas</TableHead>
                        <TableHead className="text-right">Salidas</TableHead>
                        <TableHead className="text-right">C.U. (Bs)</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fifoMovs.map(m => {
                        const lot = lots.find(l => l.id === m.inventory_lot_id);
                        const isEntrada = m.tipo === 'ENTRADA';
                        return (
                          <TableRow
                            key={m.id}
                            className={isEntrada ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}
                          >
                            <TableCell>{m.fecha}</TableCell>
                            <TableCell>{m.referencia || '—'}</TableCell>
                            <TableCell>{lot?.fecha_ingreso || '—'}</TableCell>
                            <TableCell className="text-right">{isEntrada ? m.cantidad : ''}</TableCell>
                            <TableCell className="text-right">{!isEntrada ? m.cantidad : ''}</TableCell>
                            <TableCell className="text-right">{fmt(m.costo_unitario)}</TableCell>
                            <TableCell className="text-right">{fmt(m.costo_total)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {showExit && (
          <FifoExitModal
            isOpen={showExit}
            onClose={() => setShowExit(false)}
            product={product}
            lots={lots}
            onSaved={handleExitSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
