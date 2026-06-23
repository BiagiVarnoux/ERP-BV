import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { KardexMovement } from '@/accounting/types';
import { getCurrentKardexState } from '@/accounting/kardex-utils';

export interface KardexData {
  concepto: string;
  entrada: number;
  salidas: number;
  costo_total: number;
}

interface InlineKardexPopupProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  lineAmount?: number;
  onSave: (data: KardexData) => void;
  initialData?: KardexData;
  initialConcepto?: string;
  // Precarga opcional (p.ej. pago de un producto de embarque: salida de USD ya conocida).
  // No desactiva el cálculo CPP — a diferencia de initialData.
  forceMovementType?: 'entrada' | 'salida';
  defaultCantidad?: number;
}

export function InlineKardexPopup({
  isOpen,
  onClose,
  accountId,
  lineAmount,
  onSave,
  initialData,
  initialConcepto,
  forceMovementType,
  defaultCantidad,
}: InlineKardexPopupProps) {
  const { accounts, kardexDefinitions } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const [movementType, setMovementType] = useState<'entrada' | 'salida'>('entrada');
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoTotal, setCostoTotal] = useState('');
  const [saldoActual, setSaldoActual] = useState(0);
  const [costoUnitarioActual, setCostoUnitarioActual] = useState(0);
  const [loading, setLoading] = useState(false);

  const account = accounts.find(a => a.id === accountId);

  // Load kardex data when opening for salidas
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setConcepto(initialData.concepto);
        setCantidad(String(initialData.entrada || initialData.salidas));
        setCostoTotal(String(initialData.costo_total));
        setMovementType(initialData.entrada > 0 ? 'entrada' : 'salida');
      } else {
        setConcepto(initialConcepto ?? '');
        setCantidad(defaultCantidad != null && defaultCantidad > 0 ? String(defaultCantidad) : '');
        setCostoTotal('');
        setMovementType(forceMovementType ?? 'entrada');
        setSaldoActual(0);
        setCostoUnitarioActual(0);
      }
    }
  }, [isOpen, initialData, initialConcepto, forceMovementType, defaultCantidad]);

  // Load kardex data when opening or switching to salida
  useEffect(() => {
    if (isOpen && movementType === 'salida' && !initialData) {
      loadKardexData();
    }
  }, [isOpen, movementType, accountId, initialData]);

  async function loadKardexData() {
    try {
      setLoading(true);
      const kardexDef = kardexDefinitions.find(d => d.account_id === accountId);
      if (!kardexDef) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get or create kardex entry
      let kardexId = '';
      const { data: existingKardex } = await supabase
        .from('kardex_entries')
        .select('id')
        .eq('account_id', accountId)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (existingKardex) {
        kardexId = existingKardex.id;
      } else {
        // Si no existe kardex entry, el saldo es 0
        setSaldoActual(0);
        setCostoUnitarioActual(0);
        return;
      }

      // Load ALL movements ordered by date
      const { data: movements } = await supabase
        .from('kardex_movements')
        .select('*')
        .eq('kardex_id', kardexId)
        .eq('company_id', activeCompanyId)
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true });

      if (!movements || movements.length === 0) {
        setSaldoActual(0);
        setCostoUnitarioActual(0);
        return;
      }

      // CALCULAR EL SALDO ACTUAL usando utilidad centralizada
      const currentState = getCurrentKardexState(movements);

      // Establecer los valores calculados
      setSaldoActual(currentState.currentBalance);
      setCostoUnitarioActual(currentState.currentUnitCost);

    } catch (error) {
      console.error('Error loading kardex data:', error);
      toast.error('Error al cargar datos del Kardex');
      setSaldoActual(0);
      setCostoUnitarioActual(0);
    } finally {
      setLoading(false);
    }
  }

  // Auto-calculate costo total for salidas
  useEffect(() => {
    if (movementType === 'salida' && cantidad && costoUnitarioActual > 0) {
      const cantidadNum = parseFloat(cantidad);
      if (!isNaN(cantidadNum)) {
        setCostoTotal((cantidadNum * costoUnitarioActual).toFixed(2));
      }
    }
  }, [movementType, cantidad, costoUnitarioActual]);

  const handleSave = () => {
    if (!concepto.trim()) {
      toast.error('Ingresa el concepto');
      return;
    }

    const cantidadNum = parseFloat(cantidad);
    if (!cantidadNum || cantidadNum <= 0) {
      toast.error('Ingresa una cantidad válida');
      return;
    }

    // Validaciones según tipo de movimiento
    if (movementType === 'entrada') {
      const costoTotalNum = parseFloat(costoTotal);
      if (!costoTotalNum || costoTotalNum <= 0) {
        toast.error('Para entradas, el costo total es requerido');
        return;
      }
    } else {
      // Para salidas, verificar que no exceda el saldo
      if (cantidadNum > saldoActual) {
        toast.error(`La cantidad de salida (${cantidadNum}) excede el saldo disponible (${saldoActual})`);
        return;
      }
    }

    const costoTotalNum = parseFloat(costoTotal) || 0;
    const isEntrada = movementType === 'entrada';

    const kardexData: KardexData = {
      concepto: concepto.trim(),
      entrada: isEntrada ? cantidadNum : 0,
      salidas: isEntrada ? 0 : cantidadNum,
      costo_total: isEntrada ? costoTotalNum : costoTotalNum
    };

    onSave(kardexData);
    toast.success('Movimiento de Kárdex registrado');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Movimiento de Kárdex</DialogTitle>
          <div className="text-sm text-muted-foreground">
            Cuenta: {accountId} - {account?.name}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Movimiento */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Tipo de Movimiento</Label>
            <RadioGroup value={movementType} onValueChange={(v) => setMovementType(v as 'entrada' | 'salida')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="entrada" id="entrada" />
                <Label htmlFor="entrada" className="font-normal cursor-pointer">
                  📈 Entrada (Compra)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="salida" id="salida" />
                <Label htmlFor="salida" className="font-normal cursor-pointer">
                  📉 Salida (Venta/Uso)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Información de Saldo (solo para salidas) */}
          {movementType === 'salida' && (
            <div className="bg-muted/50 p-3 rounded-md space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo Actual:</span>
                <span className="font-medium">{saldoActual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Costo Unitario:</span>
                <span className="font-medium">Bs. {costoUnitarioActual.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">Concepto</Label>
            <Input
              placeholder="Ej. Compra Lote 1, Venta Cliente X"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">
              {movementType === 'entrada' ? 'Cantidad de Entrada' : 'Cantidad de Salida'}
            </Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
            {movementType === 'salida' && saldoActual > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Máximo disponible: {saldoActual.toFixed(2)}
              </p>
            )}
          </div>

          {movementType === 'entrada' && (
            <div>
              <Label className="text-sm font-medium">Costo Total (Bs.)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={costoTotal}
                onChange={(e) => setCostoTotal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {lineAmount 
                  ? `Monto total de la compra según el asiento: ${lineAmount.toFixed(2)}`
                  : 'Ingresa el monto total de la compra'}
              </p>
            </div>
          )}

          {movementType === 'salida' && costoTotal && (
            <div className="bg-muted/50 p-3 rounded-md">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Costo Total Calculado:</span>
                <span className="font-medium">Bs. {costoTotal}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Cargando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
