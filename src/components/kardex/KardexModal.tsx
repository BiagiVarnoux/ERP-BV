import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { fmt } from '@/accounting/utils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface KardexMovementData {
  concepto: string;
  entrada: number;
  salidas: number;
  costo_total: number;
}

interface LineToProcess {
  lineDraft: any;
  lineIndex: number;
  accountId: string;
  lineAmount: number;
  isIncrease: boolean;
}

interface KardexModalProps {
  isOpen: boolean;
  onClose: () => void;
  linesToProcess: LineToProcess[];
  originalEntry: any;
  onSave: (entry: any) => void;
}

export function KardexModal({
  isOpen,
  onClose,
  linesToProcess,
  originalEntry,
  onSave
}: KardexModalProps) {
  const { accounts } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [lineMovements, setLineMovements] = useState<{ [lineIndex: number]: KardexMovementData }>({});
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoTotal, setCostoTotal] = useState('');

  const currentLine = linesToProcess[currentLineIndex];
  const currentMovement = lineMovements[currentLineIndex];
  const account = accounts.find(a => a.id === currentLine?.accountId);

  useEffect(() => {
    if (isOpen && linesToProcess.length > 0) {
      setCurrentLineIndex(0);
      setLineMovements({});
      setConcepto('');
      setCantidad('');
      setCostoTotal('');
    }
  }, [isOpen, linesToProcess]);

  const handleSetMovement = () => {
    if (!concepto.trim()) {
      toast.error('Ingresa el concepto');
      return;
    }

    const cantidadNum = parseFloat(cantidad);
    if (!cantidadNum || cantidadNum <= 0) {
      toast.error('Ingresa una cantidad válida');
      return;
    }

    const costoTotalNum = parseFloat(costoTotal);
    
    // Para entradas, el costo total es requerido
    if (currentLine.isIncrease && (!costoTotalNum || costoTotalNum <= 0)) {
      toast.error('Para entradas, el costo total es requerido');
      return;
    }

    setLineMovements(prev => ({
      ...prev,
      [currentLineIndex]: {
        concepto: concepto.trim(),
        entrada: currentLine.isIncrease ? cantidadNum : 0,
        salidas: currentLine.isIncrease ? 0 : cantidadNum,
        costo_total: currentLine.isIncrease ? costoTotalNum : 0
      }
    }));

    toast.success('Movimiento de Kárdex registrado');
  };

  const allLinesProcessed = linesToProcess.every((_, index) => {
    return lineMovements[index] !== undefined;
  });

  const handleSave = async () => {
    if (!allLinesProcessed) {
      toast.error('Debes registrar el movimiento de Kárdex para todas las líneas');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      // Procesar todos los movimientos de Kárdex para cada línea
      for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex++) {
        const line = linesToProcess[lineIndex];
        const movement = lineMovements[lineIndex];
        
        // Buscar o crear el kardex_entry para esta cuenta
        const { data: existingKardex, error: kardexError } = await supabase
          .from('kardex_entries')
          .select('id')
          .eq('account_id', line.accountId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (kardexError) throw kardexError;

        let kardexId = existingKardex?.id;

        // Si no existe, crear uno
        if (!kardexId) {
          const { data: newKardex, error: createError } = await supabase
            .from('kardex_entries')
            .insert({
              account_id: line.accountId,
              user_id: user.id,
              company_id: activeCompanyId,
            })
            .select()
            .single();

          if (createError) throw createError;
          kardexId = newKardex.id;
        }

        // Crear el movimiento de Kárdex vinculado al asiento
        const { error: movError } = await supabase
          .from('kardex_movements')
          .insert({
            kardex_id: kardexId,
            user_id: user.id,
            company_id: activeCompanyId,
            fecha: originalEntry.date,
            concepto: movement.concepto,
            entrada: movement.entrada,
            salidas: movement.salidas,
            costo_total: movement.costo_total,
            journal_entry_id: originalEntry.id,
            saldo: 0,
            costo_unitario: 0,
            saldo_valorado: 0,
          });

        if (movError) throw movError;
      }

      // Llamar al callback de guardado del asiento original
      onSave(originalEntry);
      toast.success('Asiento y movimientos de Kárdex guardados');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar movimientos');
    }
  };

  const handlePrevious = () => {
    if (currentLineIndex > 0) {
      setCurrentLineIndex(currentLineIndex - 1);
      setConcepto('');
      setCantidad('');
      setCostoTotal('');
    }
  };

  const handleNext = () => {
    if (currentLineIndex < linesToProcess.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
      setConcepto('');
      setCantidad('');
      setCostoTotal('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Registrar Movimiento de Kárdex - Línea {currentLineIndex + 1} de {linesToProcess.length}
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            Cuenta: {currentLine?.accountId} - {account?.name}
          </div>
          <div className="text-sm font-medium">
            {currentLine?.isIncrease ? '📈 Entrada (Compra)' : '📉 Salida (Venta/Uso)'}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {currentMovement ? (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <h3 className="font-medium text-green-800 mb-2">✓ Movimiento Registrado</h3>
                <div className="text-sm space-y-1 text-green-700">
                  <div><strong>Concepto:</strong> {currentMovement.concepto}</div>
                  <div><strong>Cantidad:</strong> {fmt(currentMovement.entrada || currentMovement.salidas)}</div>
                  {currentMovement.costo_total > 0 && (
                    <div><strong>Costo Total:</strong> {fmt(currentMovement.costo_total)}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-sm font-medium">Concepto</label>
                  <Input
                    placeholder="Ej. Compra Lote 1, Venta Cliente X"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    {currentLine?.isIncrease ? 'Cantidad de Entrada' : 'Cantidad de Salida'}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                </div>

                {currentLine?.isIncrease && (
                  <div>
                    <label className="text-sm font-medium">Costo Total (Bs.)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={costoTotal}
                      onChange={(e) => setCostoTotal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Monto total de la compra según el asiento: {fmt(currentLine?.lineAmount || 0)}
                    </p>
                  </div>
                )}

                <Button onClick={handleSetMovement} className="w-full">
                  Registrar Movimiento
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handlePrevious}
                disabled={currentLineIndex === 0}
              >
                Anterior
              </Button>
              <Button 
                variant="outline" 
                onClick={handleNext}
                disabled={currentLineIndex === linesToProcess.length - 1}
              >
                Siguiente
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                variant="secondary"
                onClick={() => {
                  onSave(originalEntry);
                  onClose();
                }}
              >
                Omitir Kárdex y Guardar Asiento
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!allLinesProcessed}
              >
                Guardar Movimientos
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
