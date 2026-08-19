import { round2 } from '@/accounting/utils';

export interface InventoryLot {
  id: string;
  product_id: string;
  import_lot_id: string | null;
  fecha_ingreso: string;
  cantidad_inicial: number;
  cantidad_disponible: number;
  costo_unitario: number;
  cuenta_inventario_id: string | null;
  user_id: string;
  created_at: string;
}

export interface FifoProductState {
  saldo_total: number;
  saldo_valorado: number;
  costo_promedio_fifo: number;
  lotes_activos: number;
  costo_siguiente_salida: number;
}

export interface FifoSalidaLine {
  lot: InventoryLot;
  cantidad: number;
  costo_total: number;
}

export function calcularEstadoFifo(lots: InventoryLot[]): FifoProductState {
  const activos = lots
    .filter(l => l.cantidad_disponible > 0)
    .sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso));

  const saldo_total = activos.reduce((s, l) => s + l.cantidad_disponible, 0);
  const saldo_valorado = activos.reduce((s, l) => s + round2(l.cantidad_disponible * l.costo_unitario), 0);

  return {
    saldo_total,
    saldo_valorado: round2(saldo_valorado),
    costo_promedio_fifo: saldo_total > 0 ? round2(saldo_valorado / saldo_total) : 0,
    lotes_activos: activos.length,
    costo_siguiente_salida: activos[0]?.costo_unitario ?? 0,
  };
}

export function simularSalidaFifo(lots: InventoryLot[], cantidadSalida: number): FifoSalidaLine[] {
  const activos = lots
    .filter(l => l.cantidad_disponible > 0)
    .sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso));

  const resultado: FifoSalidaLine[] = [];
  let restante = cantidadSalida;

  for (const lot of activos) {
    if (restante <= 0) break;
    const consumir = Math.min(lot.cantidad_disponible, restante);
    resultado.push({
      lot,
      cantidad: consumir,
      costo_total: round2(consumir * lot.costo_unitario),
    });
    restante = round2(restante - consumir);
  }

  if (restante > 0) {
    throw new Error(`Stock FIFO insuficiente: faltan ${round2(restante)} unidades`);
  }

  return resultado;
}
