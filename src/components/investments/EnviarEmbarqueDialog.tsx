// src/components/investments/EnviarEmbarqueDialog.tsx
// Empuja los productos de un análisis a un embarque EN_COMPRA existente
// (o crea uno nuevo). No reemplaza los productos que el embarque ya tenga:
// solo agrega los del análisis a la lista.
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Ship, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ShipmentStorage } from '@/accounting/shipment-storage';
import { Shipment, ShipmentProduct } from '@/accounting/shipment-types';
import { generateShipmentNumber } from '@/accounting/shipment-utils';
import { todayISO } from '@/accounting/utils';
import { InvestmentAnalysis, InvestmentItem, ItemCalc } from '@/accounting/investment-types';

interface Props {
  open: boolean;
  onClose: () => void;
  analysis: InvestmentAnalysis;
  calcs: ItemCalc[];
  onSent: (embarqueId: string) => Promise<void> | void;
}

const NEW_SENTINEL = '__new__';

function itemToShipmentProduct(it: InvestmentItem, shipmentId: string): ShipmentProduct {
  return {
    id: crypto.randomUUID(),
    shipment_id: shipmentId,
    nombre: it.nombre,
    especificacion: it.especificacion,
    categoria: 'electronica',
    cantidad: it.cantidad,
    precio_usd: it.precio_usd,
    tax_pct: it.tax_pct,
    fecha_compra: todayISO(),
    tiene_bateria: it.tiene_bateria,
    costo_bateria: it.costo_bateria,
    ga_pct: it.ga_pct,
    m1: it.m1,
    m2: it.m2,
    m3: it.m3,
    peso_bruto: it.peso_bruto,
    tc_producto: it.tc,
  };
}

export function EnviarEmbarqueDialog({ open, onClose, analysis, calcs, onSent }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string>(NEW_SENTINEL);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ShipmentStorage.load()
      .then(all => {
        const enCompra = all.filter(s => s.status === 'EN_COMPRA');
        setShipments(enCompra);
        setSelected(enCompra.length > 0 ? enCompra[0].id : NEW_SENTINEL);
      })
      .catch(e => { toast.error('Error cargando embarques'); console.error(e); })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSend = async () => {
    if (analysis.items.length === 0) { toast.error('No hay productos para enviar'); return; }
    try {
      setSending(true);
      let target: Shipment;

      if (selected === NEW_SENTINEL) {
        const id = crypto.randomUUID();
        target = {
          id,
          numero: generateShipmentNumber(shipments),
          descripcion: `Desde análisis: ${analysis.nombre}`,
          status: 'EN_COMPRA',
          created_at: todayISO(),
          tc_paralelo: analysis.items[0]?.tc ?? 9.30,
          tc_oficial: 6.97,
          tarifa_manipuleo_por_kg: 25,
          metodo_peso: 'automatico',
          gastos_aduana: [],
          products: analysis.items.map(it => itemToShipmentProduct(it, id)),
        };
      } else {
        const existing = await ShipmentStorage.getById(selected);
        if (!existing) { toast.error('El embarque ya no existe'); setSending(false); return; }
        target = {
          ...existing,
          products: [
            ...existing.products,
            ...analysis.items.map(it => itemToShipmentProduct(it, existing.id)),
          ],
        };
      }

      await ShipmentStorage.upsert(target);
      toast.success(
        selected === NEW_SENTINEL
          ? `Embarque ${target.numero} creado con ${analysis.items.length} producto(s)`
          : `${analysis.items.length} producto(s) agregados a ${target.numero}`,
      );
      await onSent(target.id);
    } catch (e) {
      toast.error('Error al enviar al embarque');
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ship className="h-4 w-4" /> Enviar a embarque</DialogTitle>
          <DialogDescription>
            Se agregarán los {analysis.items.length} producto(s) del análisis al embarque elegido.
            No se modifican los productos que el embarque ya tenga.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando embarques...
          </div>
        ) : (
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {/* Crear nuevo */}
            <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selected === NEW_SENTINEL ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
              <input type="radio" checked={selected === NEW_SENTINEL} onChange={() => setSelected(NEW_SENTINEL)} />
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Crear nuevo embarque</span>
            </label>

            {/* Embarques EN_COMPRA existentes */}
            {shipments.map(s => (
              <label key={s.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selected === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                <input type="radio" checked={selected === s.id} onChange={() => setSelected(s.id)} />
                <Ship className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.numero}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.descripcion || 'Sin descripción'} · {s.products.length} producto(s)
                  </p>
                </div>
              </label>
            ))}

            {shipments.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">
                No tienes embarques abiertos (En Compra). Se creará uno nuevo.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || loading} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ship className="h-4 w-4" />}
            {sending ? 'Enviando...' : 'Enviar productos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
