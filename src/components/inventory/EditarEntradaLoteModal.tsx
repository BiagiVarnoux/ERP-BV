import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { fmt, round2 } from '@/accounting/utils';
import { InventoryLot } from './fifo-utils';
import type { InventoryMovement } from './inventory-utils';

interface EditarEntradaLoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  lot: InventoryLot;
  movement: InventoryMovement | null;
  onSaved: () => void;
}

export function EditarEntradaLoteModal({ isOpen, onClose, productName, lot, movement, onSaved }: EditarEntradaLoteModalProps) {
  const activeCompanyId = useActiveCompanyId();
  const [fecha, setFecha] = useState(lot.fecha_ingreso);
  const [cantidad, setCantidad] = useState(String(lot.cantidad_inicial));
  const [costoUnitario, setCostoUnitario] = useState(String(lot.costo_unitario));
  const [referencia, setReferencia] = useState(movement?.referencia || '');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFecha(lot.fecha_ingreso);
      setCantidad(String(lot.cantidad_inicial));
      setCostoUnitario(String(lot.costo_unitario));
      setReferencia(movement?.referencia || '');
      setConfirming(false);
    }
  }, [isOpen, lot, movement]);

  const qty = parseFloat(cantidad);
  const cu = parseFloat(costoUnitario);
  const validQty = !isNaN(qty) && qty > 0;
  const validCu = !isNaN(cu) && cu > 0;
  const nuevoCostoTotal = validQty && validCu ? round2(qty * cu) : 0;
  const huboCambios = validQty && validCu && (
    qty !== lot.cantidad_inicial || cu !== Number(lot.costo_unitario) || fecha !== lot.fecha_ingreso
  );

  function handleClose() {
    setConfirming(false);
    onClose();
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('editar_entrada_inventario', {
        p_company_id: activeCompanyId,
        p_lot_id: lot.id,
        p_cantidad: qty,
        p_costo_unitario: cu,
        p_fecha: fecha,
        p_referencia: referencia.trim() || null,
      });
      if (error) throw error;
      toast.success('Entrada corregida correctamente');
      onSaved();
      handleClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al corregir la entrada');
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={isOpen && !confirming} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corregir Entrada — {productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Solo se puede corregir un lote que todavía no tiene salidas ni transferencias registradas.
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input type="number" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Costo unitario (Bs)</Label>
              <Input type="number" min="0" step="0.01" value={costoUnitario} onChange={e => setCostoUnitario(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Referencia <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: Entrada manual" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => setConfirming(true)}
              disabled={!validQty || !validCu || !huboCambios}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isOpen && confirming} onOpenChange={o => !o && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmas la corrección de este lote?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm text-foreground">
                <p className="text-muted-foreground">{productName} · lote del {lot.fecha_ingreso}</p>
                <p>Cantidad: {lot.cantidad_inicial} → <b>{qty}</b></p>
                <p>Costo unitario: Bs {fmt(lot.costo_unitario)} → <b>Bs {fmt(cu)}</b></p>
                <p>Costo total: Bs {fmt(round2(lot.cantidad_inicial * Number(lot.costo_unitario)))} → <b>Bs {fmt(nuevoCostoTotal)}</b></p>
                <p className="pt-2 text-amber-700 dark:text-amber-400">Esta acción no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirming(false)} disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar corrección'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
