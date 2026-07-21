import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calcularEstadoProducto, InventoryMovement } from './inventory-utils';
import { todayISO } from '@/accounting/utils';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface ManualMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  movements: InventoryMovement[];
  onSaved: () => void;
}

type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE_COSTO';

interface Lote {
  id: string;
  fecha_ingreso: string;
  cantidad_disponible: number;
  costo_unitario: number;
}

export function ManualMovementModal({ isOpen, onClose, productId, productName, movements, onSaved }: ManualMovementModalProps) {
  const activeCompanyId = useActiveCompanyId();
  const [tipo, setTipo] = useState<TipoMovimiento>('ENTRADA');
  const [fecha, setFecha] = useState(todayISO());
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [montoAjuste, setMontoAjuste] = useState('');
  const [referencia, setReferencia] = useState('');
  const [saving, setSaving] = useState(false);
  // FIFO: el ajuste de costo se aplica a un lote concreto, no a un promedio.
  const [metodo, setMetodo] = useState<string>('FIFO');
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteId, setLoteId] = useState('');
  const [asiento, setAsiento] = useState('');

  const state = calcularEstadoProducto(movements);
  const isAjuste = tipo === 'AJUSTE_COSTO';
  const isFifo = metodo === 'FIFO';

  useEffect(() => {
    if (!isOpen || !productId) return;
    (async () => {
      const [{ data: prod }, { data: lots }] = await Promise.all([
        supabase.from('products').select('metodo_valuacion').eq('id', productId).maybeSingle(),
        supabase.from('inventory_lots')
          .select('id, fecha_ingreso, cantidad_disponible, costo_unitario')
          .eq('product_id', productId)
          .eq('company_id', activeCompanyId)
          .gt('cantidad_disponible', 0)
          .order('fecha_ingreso'),
      ]);
      setMetodo(prod?.metodo_valuacion ?? 'FIFO');
      const l = (lots ?? []) as Lote[];
      setLotes(l);
      if (l.length === 1) setLoteId(l[0].id);
    })();
  }, [isOpen, productId, activeCompanyId]);

  const loteSel = lotes.find(l => l.id === loteId) ?? null;

  async function handleSave() {
    // ── Ajuste de costo (NIC 2) — FIFO: sobre un lote concreto ─────────────
    if (isAjuste && isFifo) {
      const monto = parseFloat(montoAjuste);
      if (!monto || monto <= 0) { toast.error('Ingresa un monto de ajuste válido'); return; }
      if (!loteId) { toast.error('Selecciona el lote al que corresponde el costo'); return; }

      setSaving(true);
      try {
        const { data, error } = await supabase.rpc('ajustar_costo_lote', {
          p_company_id: activeCompanyId,
          p_lot_id: loteId,
          p_monto: monto,
          p_fecha: fecha,
          p_concepto: referencia.trim() || concepto.trim() || 'Ajuste de costo (NIC 2)',
          p_journal_entry_id: asiento.trim() || null,
        });
        if (error) throw error;
        const r = data as { nuevo_costo_unitario?: number } | null;
        toast.success(`Ajuste aplicado. Nuevo costo del lote: ${Number(r?.nuevo_costo_unitario ?? 0).toFixed(2)} Bs/u`);
        onSaved();
        resetAndClose();
      } catch (e: any) {
        toast.error(e.message || 'Error al guardar el ajuste');
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Ajuste de costo (NIC 2) — CPP: promedio sobre todo el stock ────────
    if (isAjuste) {
      const monto = parseFloat(montoAjuste);
      if (!monto || monto <= 0) { toast.error('Ingresa un monto de ajuste válido'); return; }
      if (state.saldo <= 0) { toast.error('El producto no tiene stock — no se puede ajustar el costo'); return; }

      setSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado');

        const nuevoCpp = (state.saldoValorado + monto) / state.saldo;

        const { error } = await supabase.from('inventory_movements').insert({
          product_id: productId,
          fecha,
          tipo: 'AJUSTE_COSTO',
          cantidad: 0,
          costo_unitario: nuevoCpp,
          costo_total: monto,
          metodo_valuacion: 'CPP',
          referencia: (referencia.trim() || concepto.trim() || 'Ajuste de costo NIC 2') + ` — CPP anterior: ${state.costoUnitario.toFixed(2)} → nuevo: ${nuevoCpp.toFixed(2)}`,
          user_id: user.id,
          company_id: activeCompanyId,
        });
        if (error) throw error;
        toast.success(`Ajuste registrado. Nuevo CPP: ${nuevoCpp.toFixed(2)} Bs/u`);
        onSaved();
        resetAndClose();
      } catch (e: any) {
        toast.error(e.message || 'Error al guardar');
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Entrada / Salida normal ────────────────────────────────────────────
    const qty = parseFloat(cantidad);
    if (!qty || qty <= 0) { toast.error('Cantidad inválida'); return; }

    let costoTotal = 0;
    let cu = 0;

    if (tipo === 'ENTRADA') {
      cu = parseFloat(costoUnitario);
      if (!cu || cu <= 0) { toast.error('Costo unitario requerido para entradas'); return; }
      costoTotal = qty * cu;
    } else {
      cu = state.costoUnitario;
      costoTotal = qty * cu;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { error } = await supabase.from('inventory_movements').insert({
        product_id: productId,
        fecha,
        tipo,
        cantidad: qty,
        costo_unitario: cu,
        costo_total: costoTotal,
        metodo_valuacion: 'CPP',
        referencia: referencia.trim() || concepto.trim() || null,
        user_id: user.id,
        company_id: activeCompanyId,
      });
      if (error) throw error;
      toast.success('Movimiento registrado');
      onSaved();
      resetAndClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function resetAndClose() {
    setTipo('ENTRADA'); setFecha(todayISO()); setConcepto('');
    setCantidad(''); setCostoUnitario(''); setMontoAjuste(''); setReferencia('');
    setLoteId(''); setAsiento('');
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento Manual — {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as TipoMovimiento)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ENTRADA">Entrada</SelectItem>
                <SelectItem value="SALIDA">Salida</SelectItem>
                <SelectItem value="AJUSTE_COSTO">Ajuste de Costo (NIC 2)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Explicación para ajuste de costo */}
          {isAjuste && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">¿Cuándo usar este tipo?</p>
              <p>Cuando incurres en un costo necesario para poner el producto en condición vendible después del embarque — por ejemplo, reparaciones, acondicionamiento, o pruebas.</p>
              {isFifo ? (
                <p>El monto se suma al costo del <span className="font-semibold">lote que elijas</span> y sube el costo de sus unidades restantes. <span className="font-semibold">No cambia la cantidad en stock.</span></p>
              ) : (
                <p>El monto se suma al saldo valorado existente y sube el CPP. <span className="font-semibold">No cambia la cantidad en stock.</span></p>
              )}
              <p className="pt-1 text-amber-700">
                Recuerda registrar el asiento contable (Debe Inventario / Haber Banco o CxP) y enlazarlo abajo.
              </p>
              {!isFifo && state.saldo > 0 && (
                <p className="pt-1 text-amber-700">
                  Stock actual: <b>{state.saldo} u</b> · CPP actual: <b>{state.costoUnitario.toFixed(2)} Bs/u</b>
                </p>
              )}
              {isFifo && lotes.length === 0 && (
                <p className="pt-1 font-semibold text-red-700">⚠ Sin lotes con unidades disponibles — no se puede ajustar el costo.</p>
              )}
              {!isFifo && state.saldo <= 0 && (
                <p className="pt-1 font-semibold text-red-700">⚠ Sin stock — no se puede ajustar el costo de un producto sin unidades.</p>
              )}
            </div>
          )}

          {/* Selector de lote — solo FIFO */}
          {isAjuste && isFifo && lotes.length > 0 && (
            <div className="space-y-2">
              <Label>Lote al que corresponde el costo</Label>
              <Select value={loteId} onValueChange={setLoteId}>
                <SelectTrigger><SelectValue placeholder="Selecciona el lote..." /></SelectTrigger>
                <SelectContent>
                  {lotes.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.fecha_ingreso} · {l.cantidad_disponible} u · {Number(l.costo_unitario).toFixed(2)} Bs/u
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {/* Concepto */}
          <div className="space-y-2">
            <Label>Concepto</Label>
            <Input
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder={isAjuste ? 'Ej: Reparación parte trasera iPhone' : 'Ajuste inventario físico'}
            />
          </div>

          {/* Cantidad — solo para ENTRADA / SALIDA */}
          {!isAjuste && (
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input type="number" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
            </div>
          )}

          {/* Costo unitario — solo para ENTRADA */}
          {tipo === 'ENTRADA' && (
            <div className="space-y-2">
              <Label>Costo unitario (Bs)</Label>
              <Input type="number" min="0" step="0.01" value={costoUnitario} onChange={e => setCostoUnitario(e.target.value)} />
            </div>
          )}

          {/* Monto de ajuste — solo para AJUSTE_COSTO */}
          {isAjuste && (
            <div className="space-y-2">
              <Label>Monto total del ajuste (Bs)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={montoAjuste}
                onChange={e => setMontoAjuste(e.target.value)}
                placeholder="Ej: 500"
              />
              {/* Vista previa — FIFO: sobre el lote elegido */}
              {isFifo && loteSel && parseFloat(montoAjuste) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Nuevo costo del lote: <b>{(Number(loteSel.costo_unitario) + parseFloat(montoAjuste) / Number(loteSel.cantidad_disponible)).toFixed(2)} Bs/u</b>
                  {' '}(antes: {Number(loteSel.costo_unitario).toFixed(2)} Bs/u · {loteSel.cantidad_disponible} u)
                </p>
              )}
              {/* Vista previa — CPP */}
              {!isFifo && state.saldo > 0 && parseFloat(montoAjuste) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Nuevo CPP: <b>{((state.saldoValorado + parseFloat(montoAjuste)) / state.saldo).toFixed(2)} Bs/u</b>
                  {' '}(antes: {state.costoUnitario.toFixed(2)} Bs/u)
                </p>
              )}
            </div>
          )}

          {/* Asiento contable — solo ajuste FIFO */}
          {isAjuste && isFifo && (
            <div className="space-y-2">
              <Label>Asiento del Libro Diario <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={asiento} onChange={e => setAsiento(e.target.value)} placeholder="Ej: 048-Q3-26" />
            </div>
          )}

          {/* Referencia */}
          <div className="space-y-2">
            <Label>Referencia <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: Asiento #42, Factura técnico" />
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || (isAjuste && (isFifo ? lotes.length === 0 : state.saldo <= 0))}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

