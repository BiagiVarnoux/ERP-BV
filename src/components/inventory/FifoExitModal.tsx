import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { fmt, round2, todayISO } from '@/accounting/utils';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { InventoryLot, simularSalidaFifo } from './fifo-utils';

interface FifoExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; nombre: string; unidad_medida: string };
  lots: InventoryLot[];
  onSaved: (totalCosto: number) => void;
  journalEntryId?: string;
  journalDate?: string;
}

export function FifoExitModal({ isOpen, onClose, product, lots, onSaved, journalEntryId, journalDate }: FifoExitModalProps) {
  const activeCompanyId = useActiveCompanyId();
  const [fecha, setFecha] = useState(journalDate || todayISO());
  const [cantidad, setCantidad] = useState('');
  const [referencia, setReferencia] = useState(journalEntryId || '');
  const [saving, setSaving] = useState(false);

  // Reset when props change
  React.useEffect(() => {
    if (isOpen) {
      setFecha(journalDate || todayISO());
      setReferencia(journalEntryId || '');
    }
  }, [isOpen, journalDate, journalEntryId]);

  const qty = parseFloat(cantidad) || 0;

  const preview = useMemo(() => {
    if (qty <= 0) return { lines: [], error: null };
    try {
      const lines = simularSalidaFifo(lots, qty);
      return { lines, error: null };
    } catch (e: any) {
      return { lines: [], error: e.message };
    }
  }, [lots, qty]);

  const totalCosto = round2(preview.lines.map(l => l.costo_total).reduce((a, b) => a + b, 0));

  async function handleSave() {
    if (qty <= 0 || preview.error) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      for (const linea of preview.lines) {
        const nuevaDisponible = round2(linea.lot.cantidad_disponible - linea.cantidad);
        const { error: lotErr } = await supabase
          .from('inventory_lots')
          .update({ cantidad_disponible: nuevaDisponible })
          .eq('id', linea.lot.id)
          .eq('company_id', activeCompanyId);
        if (lotErr) throw lotErr;

        const { error: movErr } = await supabase.from('inventory_movements').insert({
          product_id: product.id,
          inventory_lot_id: linea.lot.id,
          fecha,
          tipo: 'SALIDA',
          cantidad: linea.cantidad,
          costo_unitario: linea.lot.costo_unitario,
          costo_total: linea.costo_total,
          metodo_valuacion: 'FIFO',
          referencia: referencia.trim() || null,
          journal_entry_id: journalEntryId || null,
          user_id: user.id,
          company_id: activeCompanyId,
        });
        if (movErr) throw movErr;
      }

      toast.success(`Salida FIFO registrada — ${qty} ${product.unidad_medida}, costo total Bs ${fmt(totalCosto)}`);
      onSaved(totalCosto);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar salida');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Salida FIFO — {product.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Cantidad ({product.unidad_medida})</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label>Referencia (opcional)</Label>
            <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: Venta #001" />
          </div>

          {preview.error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {preview.error}
            </div>
          )}

          {preview.lines.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Lotes a consumir:</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote (Fecha)</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">C.U. (Bs)</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.lot.fecha_ingreso}</TableCell>
                      <TableCell className="text-right">{l.cantidad}</TableCell>
                      <TableCell className="text-right">{fmt(l.lot.costo_unitario)}</TableCell>
                      <TableCell className="text-right">{fmt(l.costo_total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{qty}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">Bs {fmt(totalCosto)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || qty <= 0 || !!preview.error}
            >
              {saving ? 'Guardando...' : 'Registrar Salida'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
