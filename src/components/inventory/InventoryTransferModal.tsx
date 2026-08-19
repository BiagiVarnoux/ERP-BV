import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { useAccounting } from '@/accounting/AccountingProvider';
import { fmt, round2, todayISO } from '@/accounting/utils';
import { InventoryLot } from './fifo-utils';
import { useToast } from '@/hooks/use-toast';

interface InventoryTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; nombre: string; codigo: string; unidad_medida: string };
  lots: InventoryLot[];
  onSaved: () => void;
}

export function InventoryTransferModal({ isOpen, onClose, product, lots, onSaved }: InventoryTransferModalProps) {
  const activeCompanyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const { toast } = useToast();

  // Cuentas de origen: solo las que tienen lotes con stock disponible para este producto
  const origenes = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lots) {
      if (l.cantidad_disponible <= 0) continue;
      const key = l.cuenta_inventario_id || '';
      map.set(key, round2((map.get(key) ?? 0) + l.cantidad_disponible));
    }
    return Array.from(map.entries())
      .filter(([k]) => k !== '')
      .map(([cuenta, disponible]) => ({ cuenta, disponible }));
  }, [lots]);

  const activoAccounts = useMemo(
    () => accounts.filter(a => a.type === 'ACTIVO' && a.is_active),
    [accounts]
  );

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [glosa, setGlosa] = useState('');
  const [saving, setSaving] = useState(false);

  // Inicializar origen cuando abre / cambian los orígenes
  React.useEffect(() => {
    if (isOpen) {
      setOrigen(origenes[0]?.cuenta ?? '');
      setDestino('');
      setCantidad('');
      setFecha(todayISO());
      setGlosa('');
    }
  }, [isOpen, origenes]);

  const dispOrigen = origenes.find(o => o.cuenta === origen)?.disponible ?? 0;
  const cant = round2(Number(cantidad.replace(',', '.')) || 0);
  const nombreCuenta = (id: string) => accounts.find(a => a.id === id)?.name ?? id;

  const valid = origen && destino && origen !== destino && cant > 0 && cant <= dispOrigen;

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('transferir_inventario', {
        p_company_id: activeCompanyId,
        p_product_id: product.id,
        p_cuenta_origen: origen,
        p_cuenta_destino: destino,
        p_cantidad: cant,
        p_fecha: fecha,
        p_glosa: glosa || null,
      });
      if (error) throw error;
      const res = data as { costo_total?: number; entry_id?: string };
      toast({
        title: 'Transferencia registrada',
        description: `Se movieron ${cant} ${product.unidad_medida} · asiento ${res?.entry_id ?? ''} · Bs ${fmt(res?.costo_total ?? 0)}`,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: 'Error al transferir', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Transferir entre cuentas — {product.codigo} {product.nombre}
          </DialogTitle>
        </DialogHeader>

        {origenes.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">
            Este producto no tiene stock disponible para transferir.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Cuenta origen</Label>
              <Select value={origen} onValueChange={setOrigen}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {origenes.map(o => (
                    <SelectItem key={o.cuenta} value={o.cuenta}>
                      {o.cuenta} — {nombreCuenta(o.cuenta)} ({o.disponible} {product.unidad_medida})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Disponible: {dispOrigen} {product.unidad_medida}
              </p>
            </div>

            <div>
              <Label>Cuenta destino</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {activoAccounts.filter(a => a.id !== origen).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.id} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cantidad</Label>
                <Input
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
                {cant > dispOrigen && (
                  <p className="text-xs text-red-600 mt-1">Excede el disponible.</p>
                )}
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Glosa (opcional)</Label>
              <Input
                value={glosa}
                onChange={e => setGlosa(e.target.value)}
                placeholder="Motivo de la transferencia"
              />
            </div>

            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-800 dark:text-blue-200">
              Se moverán las unidades por orden FIFO conservando su costo, y se generará
              un asiento automático: <strong>Debe</strong> {destino || 'destino'} /{' '}
              <strong>Haber</strong> {origen || 'origen'}, al costo de las unidades movidas.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? 'Transfiriendo…' : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
