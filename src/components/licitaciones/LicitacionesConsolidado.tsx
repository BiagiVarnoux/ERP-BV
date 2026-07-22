// src/components/licitaciones/LicitacionesConsolidado.tsx
// Vista consolidada de varias licitaciones seleccionadas (p.ej. las adjudicadas):
// combina el costo de importación, precio piso, ganancia, ROI, IVA, envío, etc.
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Licitacion, LicitacionResumen, LICITACION_ESTADO_LABELS, LICITACION_ESTADO_COLORS } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { calcProducto, calcResumen, sumarResumenes } from '@/accounting/licitacion-utils';
import { fmt } from '@/accounting/utils';
import { Badge } from '@/components/ui/badge';

interface Props {
  ids: string[];
  onClose: () => void;
}

interface Item {
  licitacion: Licitacion;
  resumen: LicitacionResumen;
}

export function LicitacionesConsolidado({ ids, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const licitaciones = await Promise.all(ids.map(id => LicitacionStorage.loadOne(id)));
        const built = licitaciones.map(lit => {
          const calcs = lit.productos.map(p => calcProducto(p, {
            tcOficial: lit.tc_oficial, fleteCifPct: lit.flete_cif_pct,
          }));
          const costosLic = (lit.garantia_licitacion || 0) + (lit.pasaje_licitacion || 0)
            + (lit.envio_licitacion || 0) + (lit.otros_costos_licitacion || 0);
          return { licitacion: lit, resumen: calcResumen(lit.productos, calcs, costosLic) };
        });
        if (active) setItems(built);
      } catch {
        toast.error('Error al cargar las licitaciones seleccionadas');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ids]);

  const total = sumarResumenes(items.map(i => i.resumen));

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consolidado — {ids.length} licitaciones</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Totales combinados */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Totales combinados
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {total.tiene_importados && <Item label="Costo productos importados" value={total.costo_importados} />}
                {total.tiene_nacionales && <Item label="Costo mercadería nacional" value={total.costo_nacional} />}
                <Item label="Precio piso total" value={total.precio_piso_total} />
                <Item label="Total ofertado" value={total.total_ofertado} />
                <Item label="IVA a pagar" value={total.iva_pagar} />
                <Item label="IT a pagar" value={total.it_pagar} />
                {total.costos_licitacion > 0 && <Item label="Costos de licitación" value={total.costos_licitacion} />}
                <Item label="Costos totales" value={total.costos} bold />
                <Item
                  label="Ganancia"
                  value={total.ganancia}
                  bold
                  color={total.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
                />
              </div>

              {total.tiene_importados && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Desglose — productos importados
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Item label="Precio total (USD)" value={total.total_usd} unit="USD" />
                    <Item label="Compra (Bs)" value={total.total_precio_bs} />
                    <Item label="Envío" value={total.total_envio} />
                    <Item label="GA (gravamen)" value={total.total_ga} />
                    <Item label="IVA aduana" value={total.total_iva_aduana} />
                    <Item label="Manipuleo" value={total.total_manipuleo} />
                  </div>
                </div>
              )}

              {total.tiene_nacionales && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Desglose — mercadería comprada nacionalmente
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Item label="Costo compra nacional" value={total.costo_nacional} />
                    <Item label="Crédito fiscal (facturas)" value={total.total_iva_credito_local} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">ROI combinado:</span>
                <span className={`text-base font-bold font-mono ${total.roi < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {(total.roi * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Desglose por licitación */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Por licitación
              </p>
              {items.map(({ licitacion: l, resumen: r }) => (
                <div key={l.id} className="rounded border p-3 flex items-center gap-3">
                  <Badge className={`shrink-0 text-xs ${LICITACION_ESTADO_COLORS[l.estado]}`}>
                    {LICITACION_ESTADO_LABELS[l.estado]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{l.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.entidad}</p>
                  </div>
                  <div className="flex gap-4 shrink-0 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Costos</p>
                      <p className="text-sm font-mono">Bs {fmt(r.costos)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Ganancia</p>
                      <p className={`text-sm font-mono ${r.ganancia < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        Bs {fmt(r.ganancia)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">ROI</p>
                      <p className="text-sm font-mono">{(r.roi * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, value, bold, color, unit = 'Bs' }: {
  label: string; value: number; bold?: boolean; color?: string; unit?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>
        {unit} {fmt(value)}
      </p>
    </div>
  );
}
