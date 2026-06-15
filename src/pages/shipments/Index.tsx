// src/pages/shipments/Index.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Trash2, Package, ChevronRight, ArrowRight, ArrowLeft,
  CheckCircle, Plane, ShoppingCart, Warehouse,
  FileText, Calculator, AlertCircle, Eye, Pencil, GripVertical, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { fmt, todayISO, round2 } from '@/accounting/utils';
import { generateEntryId } from '@/accounting/utils';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';

import {
  Shipment, ShipmentProduct, ShipmentExpense,
  ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS,
} from '@/accounting/shipment-types';
import { ShipmentStorage } from '@/accounting/shipment-storage';
import {
  calcPrecioBs, calcPrecioBOB, calcPesoVolumen, calcPesoEfectivo, getPesoEfectivoPorMetodo,
  calcGAEstimado, calcIVAEstimado, calcTotalBsProducto,
  calcCostoFinalPorProducto, generateShipmentNumber,
  getAllCategories, saveCustomCategory,
} from '@/accounting/shipment-utils';
import { ShipmentCloseModal, ProductLink } from '@/components/inventory/ShipmentCloseModal';
import { FileAttachments } from '@/components/shipments/FileAttachments';
import { supabase } from '@/integrations/supabase/client';
import { exportShipmentToPDF, ShipmentPDFData } from '@/services/pdfService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyProduct(shipment_id: string): ShipmentProduct {
  return {
    id: crypto.randomUUID(),
    shipment_id,
    nombre: '',
    categoria: 'electronica',
    cantidad: 1,
    precio_usd: 0,
    tax_pct: 0,
    fecha_compra: todayISO(),
    tiene_bateria: false,
    costo_bateria: 0,
    ga_pct: 15,
  };
}

function newShipment(existingShipments: Shipment[] = []): Shipment {
  const id = crypto.randomUUID();
  return {
    id,
    numero: generateShipmentNumber(existingShipments),
    descripcion: '',
    status: 'EN_COMPRA',
    created_at: todayISO(),
    tc_paralelo: 9.30,
    tc_oficial: 6.97,
    tarifa_manipuleo_por_kg: 25,
    metodo_peso: 'automatico' as const,
    gastos_aduana: [],
    products: [emptyProduct(id)],
  };
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const { entries, setEntries, adapter } = useAccounting();
  const { can } = useUserAccess();
  const canCreate  = can('shipments', 'create');
  const canEdit    = can('shipments', 'edit');
  const canDelete  = can('shipments', 'delete');
  const isReadOnly = !canCreate && !canEdit && !canDelete;
  const activeCompanyId = useActiveCompanyId();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [draft, setDraft] = useState<Shipment>(() => newShipment());
  const [closeConfirmState, setCloseConfirmState] = useState<{
    shipment: Shipment;
    costos: Array<{ product: ShipmentProduct; costo_unitario: number; precioBsTotal: number; detalle: any }>;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ shipment: Shipment; step: 1 | 2 } | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<{ shipment: Shipment; step: 1 | 2 } | null>(null);

  const reloadShipments = useCallback(async () => {
    try {
      const list = await ShipmentStorage.load();
      setShipments(list);
      return list;
    } catch (e: any) {
      toast.error('Error al cargar embarques: ' + e.message);
      return [];
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Auto-migrate from localStorage if needed
      const migrated = await ShipmentStorage.migrateFromLocalStorage();
      if (migrated > 0) {
        toast.success(`${migrated} embarque(s) migrados de localStorage a Supabase`);
      }
      await reloadShipments();
      setLoading(false);
    })();
  }, [reloadShipments]);

  const selected = useMemo(
    () => shipments.find(s => s.id === selectedId) ?? null,
    [shipments, selectedId]
  );

  const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(s: Shipment) {
    // Update local state immediately for responsive UI
    setShipments(prev => prev.map(existing => existing.id === s.id ? s : existing));
    // Debounce the actual Supabase save
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        await ShipmentStorage.upsert(s);
      } catch (e: any) {
        toast.error('Error al guardar: ' + e.message);
      }
    }, 800);
  }

  async function handleCreate() {
    if (draft.products.length === 0 || draft.products.every(p => !p.nombre)) {
      toast.error('Agrega al menos un producto con nombre');
      return;
    }
    const createdId = draft.id;
    const createdNumero = draft.numero;
    await ShipmentStorage.upsert(draft);
    const updated = await reloadShipments();
    setSelectedId(createdId);
    setShowNewDialog(false);
    setDraft(newShipment(updated));
    toast.success(`Embarque ${createdNumero} creado`);
  }

  function handleDeleteRequest(s: Shipment) {
    setDeleteConfirm({ shipment: s, step: 1 });
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    const { shipment, step } = deleteConfirm;
    if (shipment.status === 'CERRADO' && step === 1) {
      // Don't close — advance to step 2
      setDeleteConfirm({ shipment, step: 2 });
      return;
    }
    try {
      await ShipmentStorage.delete(shipment.id);
      await reloadShipments();
      if (selectedId === shipment.id) setSelectedId(null);
      toast.success('Embarque eliminado');
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    } finally {
      setDeleteConfirm(null);
    }
  }

  // ── Avanzar estado ──────────────────────────────────────────────────────────
  async function handleAdvance(s: Shipment) {
    const flow: ShipmentStatus[] = ['EN_COMPRA', 'FLETE_PAGADO', 'EN_ADUANA', 'EN_ALMACEN'];
    const idx = flow.indexOf(s.status);
    if (idx < 0) return;

    if (s.status === 'EN_COMPRA') {
      const bad = s.products.find(p => !p.nombre.trim());
      if (bad) { toast.error('Todos los productos necesitan nombre y precio USD'); return; }
    }
    if (s.status === 'FLETE_PAGADO') {
      if (!s.flete_total_bs || s.flete_total_bs <= 0) {
        toast.error('Registra el monto total del flete antes de continuar'); return;
      }
    }
    if (s.status === 'EN_ADUANA') {
      const sinTributos = s.products.find(p => p.ga_monto == null || p.iva_monto == null);
      if (sinTributos) { toast.error('Ingresa GA e IVA del DIM para todos los productos (usa 0 si no aplica)'); return; }
      if (s.gastos_aduana.length === 0) { toast.error('Registra al menos un gasto de aduana'); return; }
    }
    if (s.status === 'EN_ALMACEN') {
      const metodo = s.metodo_peso ?? 'automatico';
      const sinPeso = s.products.find(p => {
        if (metodo === 'peso_volumen') return !p.m1 || !p.m2 || !p.m3;
        if (metodo === 'peso_bruto')   return !p.peso_bruto;
        // automatico: necesita al menos uno de los dos
        const tienePV = !!(p.m1 && p.m2 && p.m3);
        const tienePB = !!p.peso_bruto;
        return !tienePV && !tienePB;
      });
      if (sinPeso) {
        const msg = metodo === 'peso_volumen'
          ? 'Ingresa M1, M2 y M3 de todos los productos (método: peso volumen)'
          : metodo === 'peso_bruto'
          ? 'Ingresa el peso bruto de todos los productos (método: peso bruto)'
          : 'Cada producto necesita medidas o peso bruto para el prorrateo';
        toast.error(msg); return;
      }
    }

    const next = flow[idx + 1];
    await persist({ ...s, status: next });
    toast.success(`Estado actualizado: ${SHIPMENT_STATUS_LABELS[next]}`);
  }

  // ── Retroceder estado (con doble confirmación) ──────────────────────────────
  function handleRevertRequest(s: Shipment) {
    if (s.status === 'EN_COMPRA' || s.status === 'CERRADO') return;
    setRevertConfirm({ shipment: s, step: 1 });
  }

  async function confirmRevert() {
    if (!revertConfirm) return;
    const { shipment, step } = revertConfirm;
    if (step === 1) {
      setRevertConfirm({ shipment, step: 2 });
      return;
    }
    const flow: ShipmentStatus[] = ['EN_COMPRA', 'FLETE_PAGADO', 'EN_ADUANA', 'EN_ALMACEN'];
    const idx = flow.indexOf(shipment.status);
    if (idx <= 0) { setRevertConfirm(null); return; }
    const prev = flow[idx - 1];
    try {
      await persist({ ...shipment, status: prev });
      toast.success(`Estado revertido a: ${SHIPMENT_STATUS_LABELS[prev]}`);
    } catch (e: any) {
      toast.error('Error al retroceder: ' + e.message);
    } finally {
      setRevertConfirm(null);
    }
  }

  // ── Cerrar embarque ──────────────────────────────────────────────────────────
  function handleClose(s: Shipment) {
    const metodo = s.metodo_peso ?? 'automatico';
    const sinPeso = s.products.find(p => {
      if (metodo === 'peso_volumen') return !p.m1 || !p.m2 || !p.m3;
      if (metodo === 'peso_bruto')   return !p.peso_bruto;
      return !(p.m1 && p.m2 && p.m3) && !p.peso_bruto;
    });
    if (sinPeso) {
      const msg = metodo === 'peso_volumen'
        ? 'Todos los productos necesitan M1, M2 y M3 para el prorrateo'
        : metodo === 'peso_bruto'
        ? 'Todos los productos necesitan peso bruto para el prorrateo'
        : 'Cada producto necesita medidas o peso bruto para el prorrateo';
      toast.error(msg); return;
    }
    const costos = calcCostoFinalPorProducto(s);
    setCloseConfirmState({ shipment: s, costos });
  }

  async function handleConfirmClose(links: ProductLink[], customMemos: string[]) {
    if (!closeConfirmState) return;
    const s = closeConfirmState.shipment;
    const costos = closeConfirmState.costos;

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('No hay sesión activa');

      // 1. Create new products in Supabase
      const newProductIds: Record<string, string> = {};
      for (const link of links) {
        if (link.isNew && link.newProductData) {
          // Check if product with same codigo already exists (any status)
          const { data: existing } = await supabase.from('products')
            .select('id, status, nombre')
            .eq('codigo', link.newProductData.codigo)
            .eq('company_id', activeCompanyId)
            .maybeSingle();
          if (existing) {
            newProductIds[link.shipmentProductId] = existing.id;
            if (existing.status === 'archivado') {
              await supabase.from('products')
                .update({ status: 'activo', archived_at: null, archived_reason: null })
                .eq('id', existing.id)
                .eq('company_id', activeCompanyId);
              toast.info(`Producto "${existing.nombre}" reactivado automáticamente`);
            } else if (existing.status === 'descontinuado') {
              toast.warning(`Producto "${existing.nombre}" está marcado como descontinuado. Se vinculó al embarque pero permanece descontinuado.`);
            }
          } else {
            const { data, error } = await supabase.from('products').insert({
              nombre: link.newProductData.nombre,
              codigo: link.newProductData.codigo,
              cuenta_inventario_id: link.newProductData.cuenta_inventario_id,
              especificacion: link.newProductData.especificacion || null,
              categoria: 'importado',
              unidad_medida: 'unidad',
              user_id: user.user.id,
              company_id: activeCompanyId,
            }).select('id').single();
            if (error) throw error;
            newProductIds[link.shipmentProductId] = data.id;
          }
        }
      }

      // 2. Generate 4 journal entries
      let currentEntries = [...entries];
      const newIds: string[] = [];

      // Asiento 1 — Flete
      if (s.flete_total_bs && s.flete_total_bs > 0) {
        const e = {
          id: generateEntryId(todayISO(), currentEntries),
          date: todayISO(),
          memo: customMemos[0],
          lines: [
            { account_id: 'A.4.1', debit: s.flete_total_bs, credit: 0, line_memo: 'Flete aéreo capitalizado' },
            { account_id: 'G.2', debit: 0, credit: s.flete_total_bs },
          ],
        };
        await adapter.saveEntry(e);
        currentEntries = [...currentEntries, e];
        newIds.push(e.id);
      }

      // Asiento 2 — GA
      const totalGA = round2(s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0));
      if (totalGA > 0) {
        const e = {
          id: generateEntryId(todayISO(), currentEntries),
          date: todayISO(),
          memo: customMemos[1],
          lines: [
            { account_id: 'A.4.1', debit: totalGA, credit: 0, line_memo: 'GA capitalizado' },
            { account_id: 'G.6', debit: 0, credit: totalGA },
          ],
        };
        await adapter.saveEntry(e);
        currentEntries = [...currentEntries, e];
        newIds.push(e.id);
      }

      // Asiento 3 — Manipuleo
      const totalManipuleo = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));
      if (totalManipuleo > 0) {
        const e = {
          id: generateEntryId(todayISO(), currentEntries),
          date: todayISO(),
          memo: customMemos[2],
          lines: [
            { account_id: 'A.4.1', debit: totalManipuleo, credit: 0, line_memo: 'Manipuleo capitalizado' },
            { account_id: 'G.5', debit: 0, credit: totalManipuleo },
          ],
        };
        await adapter.saveEntry(e);
        currentEntries = [...currentEntries, e];
        newIds.push(e.id);
      }

      // Asiento 4 — Nacionalización (dynamic by cuenta_inventario_id)
      // REGLA CONTABLE: el crédito a A.4.1 debe ser EXACTAMENTE igual a la suma
      // de todos sus débitos previos (asientos 1+2+3 + pagos de productos).
      // NO se recalcula desde costos unitarios — eso acumula errores de redondeo.
      const resolvedCuentas: Record<string, string> = {};
      for (const link of links) {
        if (link.isNew && link.newProductData) {
          resolvedCuentas[link.shipmentProductId] = link.newProductData.cuenta_inventario_id;
        } else if (link.productId) {
          const { data: prod } = await supabase
            .from('products')
            .select('cuenta_inventario_id')
            .eq('id', link.productId)
            .single();
          resolvedCuentas[link.shipmentProductId] = prod?.cuenta_inventario_id ?? 'A.4.2';
        }
      }

      // Débitos exactos que ya entraron a A.4.1:
      // - Asiento 1: flete_total_bs (exacto)
      // - Asiento 2: totalGA (exacto del DIM)
      // - Asiento 3: totalManipuleo (exacto de gastos_aduana)
      // - Pagos de productos: calcTotalBsProducto por producto (exacto)
      // El total del crédito a A.4.1 = suma de esos componentes exactos.
      const totalA41Credit = round2(
        (s.flete_total_bs ?? 0) +
        totalGA +
        totalManipuleo +
        s.products.reduce((sum, p) => sum + calcTotalBsProducto(p, s.tc_paralelo), 0)
      );

      // Distribuir el débito a las cuentas de inventario proporcionalmente
      // usando los mismos totales exactos por producto
      const byAccount: Record<string, number> = {};
      costos.forEach(({ product, precioBsTotal }) => {
        const cuentaId = resolvedCuentas[product.id] ?? 'A.4.2';
        const metodo = s.metodo_peso ?? 'automatico';
        const pesoProducto = getPesoEfectivoPorMetodo(product, metodo) ?? 0;
        const pesoTotalEmb = s.products.reduce((sum, p) => sum + (getPesoEfectivoPorMetodo(p, metodo) ?? 0), 0);

        const fleteProducto  = pesoTotalEmb > 0 ? (s.flete_total_bs ?? 0) * pesoProducto / pesoTotalEmb : 0;
        const manipProducto  = pesoTotalEmb > 0 ? totalManipuleo * pesoProducto / pesoTotalEmb : 0;
        const gaProducto     = product.ga_monto ?? 0;
        const bateriaProducto = product.tiene_bateria ? product.costo_bateria : 0;

        const totalProducto = round2(precioBsTotal + fleteProducto + gaProducto + manipProducto + bateriaProducto);
        byAccount[cuentaId] = round2((byAccount[cuentaId] ?? 0) + totalProducto);
      });

      // Ajuste de redondeo: si la suma de byAccount difiere de totalA41Credit,
      // asignar la diferencia a la cuenta con mayor monto (impacto mínimo)
      const sumaByAccount = round2(Object.values(byAccount).reduce((a, b) => a + b, 0));
      const ajuste = round2(totalA41Credit - sumaByAccount);
      if (Math.abs(ajuste) > 0 && Object.keys(byAccount).length > 0) {
        const cuentaMayor = Object.entries(byAccount).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        byAccount[cuentaMayor] = round2(byAccount[cuentaMayor] + ajuste);
      }

      const totalCosto = totalA41Credit; // garantizado que cuadra

      const nationLines = [
        ...Object.entries(byAccount).map(([acct, monto]) => ({
          account_id: acct, debit: monto, credit: 0,
          line_memo: acct,
        })),
        { account_id: 'A.4.1', debit: 0, credit: totalCosto, line_memo: 'Cierre Inventario en Tránsito' },
      ];

      const nationEntry = {
        id: generateEntryId(todayISO(), currentEntries),
        date: todayISO(),
        memo: customMemos[3],
        lines: nationLines,
      };
      await adapter.saveEntry(nationEntry);
      newIds.push(nationEntry.id);

      setEntries(await adapter.loadEntries());

      // 3. Create inventory_lots and inventory_movements (FIFO)
      // Calcular costo_total exacto por producto — garantiza que la suma del Kárdex
      // coincida exactamente con el crédito del asiento A.4.1
      const metodoEmb = s.metodo_peso ?? 'automatico';
      const pesoTotalEmb = s.products.reduce((sum, p) => sum + (getPesoEfectivoPorMetodo(p, metodoEmb) ?? 0), 0);
      const fleteExacto = s.flete_total_bs ?? 0;
      const manipExacto = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));

      // Paso 1: calcular el costo total de cada producto sin round2 intermedio
      const costoTotalPorProducto: Record<string, number> = {};
      costos.forEach(({ product, precioBsTotal }) => {
        const pesoProd        = getPesoEfectivoPorMetodo(product, metodoEmb) ?? 0;
        const fleteProducto   = pesoTotalEmb > 0 ? fleteExacto * pesoProd / pesoTotalEmb : 0;
        const gaProducto      = product.ga_monto ?? 0;
        const manipProducto   = pesoTotalEmb > 0 ? manipExacto * pesoProd / pesoTotalEmb : 0;
        const bateriaProducto = product.tiene_bateria ? product.costo_bateria : 0;
        costoTotalPorProducto[product.id] = precioBsTotal + fleteProducto + gaProducto + manipProducto + bateriaProducto;
      });

      // Paso 2: aplicar round2 y ajustar la diferencia residual al producto mayor
      const costosRedondeados: Record<string, number> = {};
      let sumaRedondeada = 0;
      costos.forEach(({ product }) => {
        costosRedondeados[product.id] = round2(costoTotalPorProducto[product.id]);
        sumaRedondeada = round2(sumaRedondeada + costosRedondeados[product.id]);
      });
      const ajusteKardex = round2(totalA41Credit - sumaRedondeada);
      if (Math.abs(ajusteKardex) >= 0.01) {
        const prodMayor = costos.reduce((a, b) =>
          costoTotalPorProducto[b.product.id] > costoTotalPorProducto[a.product.id] ? b : a
        );
        costosRedondeados[prodMayor.product.id] = round2(costosRedondeados[prodMayor.product.id] + ajusteKardex);
      }

      for (const { product, costo_unitario } of costos) {
        const link = links.find(l => l.shipmentProductId === product.id);
        const productId = link?.isNew ? newProductIds[product.id] : link?.productId;
        if (!productId) continue;

        // A) Create the lot
        const { data: newLot, error: lotError } = await supabase
          .from('inventory_lots')
          .insert({
            product_id: productId,
            import_lot_id: null,
            fecha_ingreso: todayISO(),
            cantidad_inicial: product.cantidad,
            cantidad_disponible: product.cantidad,
            costo_unitario: costo_unitario,
            user_id: user.user.id,
            company_id: activeCompanyId,
          })
          .select('id')
          .single();
        if (lotError) throw lotError;

        // B) Insert movement linked to the lot
        const { error: movError } = await supabase.from('inventory_movements').insert({
          product_id: productId,
          inventory_lot_id: newLot.id,
          tipo: 'ENTRADA',
          cantidad: product.cantidad,
          costo_unitario,
          costo_total: costosRedondeados[product.id],
          fecha: todayISO(),
          referencia: `${s.numero} — Importación cerrada`,
          metodo_valuacion: 'FIFO',
          user_id: user.user.id,
          company_id: activeCompanyId,
        });
        if (movError) throw movError;
      }

      // 4. Save closed shipment
      const closed: Shipment = {
        ...s,
        status: 'CERRADO',
        journal_entry_ids: newIds,
        products: costos.map(({ product, costo_unitario, detalle }) => ({
          ...product,
          peso_volumen: calcPesoVolumen(product),
          costo_envio_unitario: detalle.envioUnitario,
          costo_manipuleo_unitario: detalle.manipuleo,
          costo_total_unitario: costo_unitario,
        })),
      };
      await persist(closed);
      setCloseConfirmState(null);
      toast.success(`Embarque ${s.numero} cerrado — ${newIds.length} asientos generados`);
    } catch (e: any) {
      toast.error(e.message || 'Error al cerrar el embarque');
      throw e;
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Embarques</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestión de importaciones por etapas
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setDraft(newShipment(shipments)); setShowNewDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Embarque
          </Button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Lista */}
        <div className="col-span-4 space-y-2">
          {shipments.length === 0 && (
            <Card className="p-10 text-center">
              <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay embarques registrados</p>
              <p className="text-xs text-muted-foreground mt-1">Crea uno para comenzar</p>
            </Card>
          )}
          {shipments.map(s => (
            <Card
              key={s.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selectedId === s.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedId(s.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{s.numero}</p>
                    {s.descripcion && (
                      <p className="text-xs text-muted-foreground truncate">{s.descripcion}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.products.length} producto{s.products.length !== 1 ? 's' : ''}
                      {' · '}{s.created_at}
                    </p>
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                    {SHIPMENT_STATUS_LABELS[s.status]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detalle */}
        <div className="col-span-8">
          {!selected ? (
            <Card className="p-16 text-center">
              <ChevronRight className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-muted-foreground text-sm">Selecciona un embarque para ver su detalle</p>
            </Card>
          ) : (
            <ShipmentDetail
              shipment={selected}
              isReadOnly={isReadOnly}
              onSave={persist}
              onDelete={() => handleDeleteRequest(selected)}
              onAdvance={() => handleAdvance(selected)}
              onRevert={() => handleRevertRequest(selected)}
              onClose={() => handleClose(selected)}
            />
          )}
        </div>
      </div>

      {/* Modal nuevo embarque */}
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Embarque — {draft.numero}</DialogTitle>
              </DialogHeader>
              <NewShipmentForm
                draft={draft}
                onChange={setDraft}
                onCreate={handleCreate}
                onCancel={() => setShowNewDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Modal de cierre */}
          {closeConfirmState && (
            <ShipmentCloseModal
              isOpen={!!closeConfirmState}
              shipment={closeConfirmState.shipment}
              costos={closeConfirmState.costos}
              onConfirm={handleConfirmClose}
              onCancel={() => setCloseConfirmState(null)}
            />
          )}

          {/* Modal doble confirmación eliminar */}
          <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {deleteConfirm?.step === 2
                    ? '⚠️ Confirmar eliminación definitiva'
                    : `¿Eliminar embarque ${deleteConfirm?.shipment.numero}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteConfirm?.step === 2
                    ? 'Esta acción es irreversible. Los asientos contables generados NO se eliminarán.'
                    : 'Esta acción no se puede deshacer. Se eliminará toda la información del embarque.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                {deleteConfirm?.shipment.status === 'CERRADO' && deleteConfirm?.step === 1 ? (
                  <Button
                    onClick={confirmDelete}
                  >
                    Continuar
                  </Button>
                ) : (
                  <AlertDialogAction
                    onClick={confirmDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteConfirm?.step === 2 ? 'Eliminar definitivamente' : 'Eliminar'}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Modal doble confirmación retroceder estado */}
          <AlertDialog open={!!revertConfirm} onOpenChange={(open) => { if (!open) setRevertConfirm(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {revertConfirm?.step === 2
                    ? '⚠️ Confirmación final'
                    : '¿Retroceder estado del embarque?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {(() => {
                    if (!revertConfirm) return null;
                    const flow: ShipmentStatus[] = ['EN_COMPRA', 'FLETE_PAGADO', 'EN_ADUANA', 'EN_ALMACEN'];
                    const idx = flow.indexOf(revertConfirm.shipment.status);
                    const prev = idx > 0 ? flow[idx - 1] : null;
                    const currentLabel = SHIPMENT_STATUS_LABELS[revertConfirm.shipment.status];
                    const prevLabel = prev ? SHIPMENT_STATUS_LABELS[prev] : '';
                    if (revertConfirm.step === 2) {
                      return `Esta acción es reversible volviendo a avanzar, pero asegúrate de que es lo que quieres hacer. Se cambiará el estado de "${currentLabel}" a "${prevLabel}".`;
                    }
                    return `¿Seguro que quieres retroceder el estado de "${currentLabel}" a "${prevLabel}"? Los datos ingresados en este paso (ej. flete, aduana, medidas) se conservan, solo cambia el estado.`;
                  })()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmRevert}>
                  {revertConfirm?.step === 2 ? 'Sí, retroceder' : 'Continuar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
    </div>
  );
}

// ─── Formulario nuevo embarque ─────────────────────────────────────────────────

function NewShipmentForm({ draft, onChange, onCreate, onCancel }: {
  draft: Shipment;
  onChange: (s: Shipment) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const allCategories = getAllCategories();
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  function updateProduct(id: string, patch: Partial<ShipmentProduct>) {
    const updated = draft.products.map(p => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch };
      // Recalcular T/C si se cambia precio_usd o precio_bs_pagado
      if ('precio_usd' in patch || 'precio_bs_pagado' in patch) {
        const usd = next.precio_usd;
        const bs = next.precio_bs_pagado;
        if (usd && usd > 0 && bs && bs > 0) {
          next.tc_producto = round2(bs / usd);
        } else {
          next.tc_producto = undefined;
        }
      }
      return next;
    });
    onChange({ ...draft, products: updated });
  }

  function addProduct() {
    onChange({ ...draft, products: [...draft.products, emptyProduct(draft.id)] });
  }
  function removeProduct(id: string) {
    if (draft.products.length <= 1) return;
    onChange({ ...draft, products: draft.products.filter(p => p.id !== id) });
  }

  function handleCategorySelect(productId: string, value: string) {
    if (value === '__nueva__') {
      setPendingProductId(productId);
      setNewCategoryName('');
      setShowCategoryDialog(true);
    } else {
      updateProduct(productId, { categoria: value });
    }
  }

  function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    const slug = newCategoryName.toLowerCase().replace(/\s+/g, '_');
    saveCustomCategory(slug, newCategoryName);
    if (pendingProductId) {
      updateProduct(pendingProductId, { categoria: slug });
    }
    setShowCategoryDialog(false);
    setNewCategoryName('');
    setPendingProductId(null);
    toast.success(`Categoría "${newCategoryName}" creada`);
  }

  return (
    <>
      <div className="space-y-6">
        {/* Datos generales */}
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-3">
            <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={draft.descripcion}
              onChange={e => onChange({ ...draft, descripcion: e.target.value })}
              placeholder="Ej: Electrónica enero 2025"
            />
          </div>
          <div>
            <Label>T/C Referencia</Label>
            <Input
              type="number" step="0.01"
              value={draft.tc_paralelo}
              onChange={e => onChange({ ...draft, tc_paralelo: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground mt-1">Se usa si el producto no tiene T/C propio</p>
          </div>
        </div>

        <Separator />

        {/* Productos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-base font-semibold">Productos del embarque</Label>
            <Button size="sm" variant="outline" onClick={addProduct}>
              <Plus className="w-4 h-4 mr-1" />Agregar producto
            </Button>
          </div>

          <div className="space-y-4">
            {draft.products.map((p) => {
              const tcEfectivo = p.tc_producto ?? draft.tc_paralelo;
              return (
                <Card key={p.id} className="p-4 bg-muted/30">
                  {/* Fila 1: Nombre, Categoría, Cantidad, Fecha */}
                  <div className="grid grid-cols-12 gap-3 items-end mb-3">
                    <div className="col-span-4">
                      <Label className="text-xs">Nombre del producto</Label>
                      <Input placeholder="iPhone 14 Pro" value={p.nombre}
                        onChange={e => updateProduct(p.id, { nombre: e.target.value })} />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Categoría</Label>
                      <Select value={p.categoria} onValueChange={v => handleCategorySelect(p.id, v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(allCategories).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                          <SelectItem value="__nueva__">➕ Nueva categoría...</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Cant.</Label>
                      <Input type="number" min="1" value={p.cantidad}
                        onChange={e => updateProduct(p.id, { cantidad: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Fecha compra</Label>
                      <Input type="date" value={p.fecha_compra}
                        onChange={e => updateProduct(p.id, { fecha_compra: e.target.value })} />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">GA %</Label>
                      <Input type="number" value={p.ga_pct}
                        onChange={e => updateProduct(p.id, { ga_pct: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-1 flex items-center justify-center mt-4">
                      <Button size="sm" variant="ghost" onClick={() => removeProduct(p.id)}
                        disabled={draft.products.length <= 1}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Fila 2: Precio USD, Precio Bs pagado, T/C calculado, Tax */}
                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-3">
                      <Label className="text-xs">Precio USD <span className="text-muted-foreground">(sin tax)</span></Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={p.precio_usd || ''}
                        onChange={e => updateProduct(p.id, { precio_usd: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">
                        Precio Bs pagado
                        <span className="text-muted-foreground ml-1">(para calcular T/C)</span>
                      </Label>
                      <Input type="number" step="0.01" placeholder="0.00"
                        value={p.precio_bs_pagado || ''}
                        onChange={e => updateProduct(p.id, { precio_bs_pagado: parseFloat(e.target.value) || undefined })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">T/C calculado</Label>
                      <div className={`h-9 px-3 flex items-center rounded-md border text-sm font-semibold
                        ${p.tc_producto ? 'bg-success/10 border-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {p.tc_producto ? p.tc_producto.toFixed(4) : `≈ ${draft.tc_paralelo} (ref.)`}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Tax %</Label>
                      <Input type="number" step="0.1" placeholder="0" value={p.tax_pct || ''}
                        onChange={e => updateProduct(p.id, { tax_pct: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2">
                      {p.precio_usd > 0 && (
                        <div className="h-9 px-3 flex flex-col justify-center rounded-md bg-primary/10 border border-primary/20">
                          <span className="text-[10px] text-primary">Precio Bs</span>
                          <span className="text-sm font-semibold text-primary">
                            {fmt(calcPrecioBs(p, tcEfectivo))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fila 3: Batería (checkbox only) */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id={`bat-${p.id}`} checked={p.tiene_bateria}
                        onChange={e => updateProduct(p.id, { tiene_bateria: e.target.checked })}
                        className="w-4 h-4 rounded" />
                      <Label htmlFor={`bat-${p.id}`} className="text-xs cursor-pointer">🔋 Certificado de batería</Label>
                    </div>
                    {p.precio_usd > 0 && (
                      <p className="text-xs text-muted-foreground ml-auto">
                        BOB para tributos: <strong>{fmt(calcPrecioBOB(p, draft.tc_oficial))}</strong>
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onCreate}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            Crear Embarque
          </Button>
        </div>
      </div>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre de la categoría</Label>
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Ej: Textiles, Ferretería..."
                onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancelar</Button>
              <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
                Crear Categoría
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Detalle del embarque ──────────────────────────────────────────────────────

function ShipmentDetail({ shipment: s, isReadOnly, onSave, onDelete, onAdvance, onRevert, onClose }: {
  shipment: Shipment;
  isReadOnly: boolean;
  onSave: (s: Shipment) => void;
  onDelete: () => void;
  onAdvance: () => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  const isClosed = s.status === 'CERRADO';

  const totalManipuleo = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));
  const totalGA = round2(s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0));
  const totalIVA = round2(s.products.reduce((sum, p) => sum + (p.iva_monto ?? 0), 0));
  const totalProductos = round2(s.products.reduce((sum, p) => sum + calcTotalBsProducto(p, s.tc_paralelo), 0));

  const nextLabel = {
    EN_COMPRA:    'Registrar Flete',
    FLETE_PAGADO: 'Llegó a Aduana',
    EN_ADUANA:    'Llegó al Almacén',
    EN_ALMACEN:   null,
    CERRADO:      null,
  }[s.status];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="w-5 h-5" />
              {s.numero}
              {s.descripcion && (
                <span className="text-sm font-normal text-muted-foreground">— {s.descripcion}</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <Badge className={SHIPMENT_STATUS_COLORS[s.status]}>
                {SHIPMENT_STATUS_LABELS[s.status]}
              </Badge>
              <span>T/C paralelo: <strong>{s.tc_paralelo}</strong></span>
              <span>T/C oficial: <strong>{s.tc_oficial}</strong></span>
            </div>
          </div>

          <div className="flex gap-2 items-center">
              {(() => {
                const buildAndExport = (includeIVA: boolean) => {
                  const costos = calcCostoFinalPorProducto(s);
                  const pdfData: ShipmentPDFData = {
                    numero: s.numero,
                    descripcion: s.descripcion,
                    status: SHIPMENT_STATUS_LABELS[s.status],
                    created_at: s.created_at,
                    tc_paralelo: s.tc_paralelo,
                    tc_oficial: s.tc_oficial,
                    flete_total_bs: s.flete_total_bs,
                    flete_fecha: s.flete_fecha,
                    metodo_peso: s.metodo_peso,
                    tarifa_manipuleo_por_kg: s.tarifa_manipuleo_por_kg,
                    products: s.products,
                    gastos_aduana: s.gastos_aduana,
                    costos: costos.map(c => ({
                      nombre: c.product.nombre,
                      cantidad: c.product.cantidad,
                      precioBs: c.detalle.precioBs,
                      envio: c.detalle.envioUnitario,
                      ga: c.detalle.ga,
                      iva: c.detalle.iva,
                      manipuleo: c.detalle.manipuleo,
                      bateria: c.detalle.bateria,
                      costo_unitario: c.costo_unitario,
                    })),
                    includeIVA,
                  };
                  exportShipmentToPDF(pdfData);
                  toast.success(includeIVA ? 'PDF (con IVA) descargado' : 'PDF descargado');
                };
                return (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => buildAndExport(false)} title="Descargar PDF (costo contable, sin IVA)">
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => buildAndExport(true)} title="Descargar PDF + IVA (informativo)">
                      <Download className="w-4 h-4 mr-1" />
                      <span className="text-[11px] font-semibold">+IVA</span>
                    </Button>
                  </>
                );
              })()}
              {!isReadOnly && (
                <>
                  <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  {!isClosed && s.status !== 'EN_COMPRA' && (
                    <Button size="sm" variant="outline" onClick={onRevert} title="Volver al estado anterior">
                      <ArrowLeft className="w-4 h-4 mr-1.5" />
                      Retroceder
                    </Button>
                  )}
                  {!isClosed && (
                    s.status === 'EN_ALMACEN' ? (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={onClose}>
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        Cerrar Embarque
                      </Button>
                    ) : nextLabel && (
                      <Button size="sm" onClick={onAdvance}>
                        <ArrowRight className="w-4 h-4 mr-1.5" />
                        {nextLabel}
                      </Button>
                    )
                  )}
                </>
              )}
            </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Resumen financiero */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Productos', value: totalProductos },
            { label: 'Flete', value: s.flete_total_bs ?? 0 },
            { label: 'Tributos (GA+IVA)', value: round2(totalGA + totalIVA) },
            { label: 'Manipuleo', value: totalManipuleo },
          ].map(({ label, value }) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-semibold text-sm mt-0.5">{fmt(value)} Bs</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="productos">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="productos" className="flex-1">
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              Productos ({s.products.length})
            </TabsTrigger>
            {s.status !== 'EN_COMPRA' && (
              <TabsTrigger value="flete" className="flex-1">
                <Plane className="w-4 h-4 mr-1.5" />
                Flete
              </TabsTrigger>
            )}
            {(s.status === 'EN_ADUANA' || s.status === 'EN_ALMACEN' || isClosed) && (
              <TabsTrigger value="aduana" className="flex-1">
                <FileText className="w-4 h-4 mr-1.5" />
                Aduana
              </TabsTrigger>
            )}
            {(s.status === 'EN_ALMACEN' || isClosed) && (
              <TabsTrigger value="medidas" className="flex-1">
                <Calculator className="w-4 h-4 mr-1.5" />
                Medidas
              </TabsTrigger>
            )}
            {isClosed && (
              <TabsTrigger value="costos" className="flex-1">
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Costos Finales
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab: Productos */}
          <TabsContent value="productos">
            <ProductosTab s={s} isReadOnly={isReadOnly} onSave={onSave} />
          </TabsContent>

          {/* Tab: Flete */}
          {s.status !== 'EN_COMPRA' && (
            <TabsContent value="flete">
              <FleteTab s={s} isReadOnly={isReadOnly} onSave={onSave} />
            </TabsContent>
          )}

          {/* Tab: Aduana */}
          {(s.status === 'EN_ADUANA' || s.status === 'EN_ALMACEN' || isClosed) && (
            <TabsContent value="aduana">
              <AduanaTab s={s} isReadOnly={isReadOnly} onSave={onSave} />
            </TabsContent>
          )}

          {/* Tab: Medidas */}
          {(s.status === 'EN_ALMACEN' || isClosed) && (
            <TabsContent value="medidas">
              <MedidasTab s={s} isReadOnly={isReadOnly} onSave={onSave} />
            </TabsContent>
          )}

          {/* Tab: Costos Finales */}
          {isClosed && (
            <TabsContent value="costos">
              <CostosFinalesTab s={s} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Tab: Productos ────────────────────────────────────────────────────────────

function ProductosTab({ s, isReadOnly, onSave }: { s: Shipment; isReadOnly: boolean; onSave: (s: Shipment) => void }) {
  const allCategories = getAllCategories();
  const activeCompanyId = useActiveCompanyId();
  const [editingProduct, setEditingProduct] = useState<ShipmentProduct | null>(null);
  const [viewFilesProduct, setViewFilesProduct] = useState<ShipmentProduct | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function saveProduct(updated: ShipmentProduct) {
    onSave({ ...s, products: s.products.map(p => p.id === updated.id ? updated : p) });
    setEditingProduct(null);
  }
  function addProduct() {
    onSave({ ...s, products: [...s.products, emptyProduct(s.id)] });
  }
  function removeProduct(id: string) {
    if (s.products.length <= 1) return;
    onSave({ ...s, products: s.products.filter(p => p.id !== id) });
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (idx !== dragIdx) setOverIdx(idx);
  }
  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...s.products];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onSave({ ...s, products: reordered });
    setDragIdx(null);
    setOverIdx(null);
  }
  function handleDragEnd() {
    setDragIdx(null);
    setOverIdx(null);
  }

  // Edición permitida en todos los estados excepto CERRADO
  const canEdit = !isReadOnly && s.status !== 'CERRADO';

  return (
    <>
      <div className="space-y-3">
        {canEdit && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={addProduct}>
              <Plus className="w-4 h-4 mr-1" />Agregar producto
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && <TableHead className="w-6" />}
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio USD</TableHead>
              <TableHead className="text-right">Tax%</TableHead>
              <TableHead className="text-right">Precio Bs</TableHead>
              <TableHead className="text-right">GA%</TableHead>
              <TableHead>Fecha</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.products.map((p, idx) => (
              <TableRow
                key={p.id}
                draggable={canEdit}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                style={{
                  opacity: dragIdx === idx ? 0.4 : 1,
                  borderTop: overIdx === idx && dragIdx !== idx ? '2px solid hsl(var(--primary))' : undefined,
                  transition: 'opacity 0.15s',
                }}
              >
                {canEdit && (
                  <TableCell className="w-6 pr-0">
                    <span
                      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors flex items-center"
                      title="Arrastra para reordenar"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  <span className="font-medium">{p.nombre}</span>
                  {p.tiene_bateria && (
                    <Badge variant="outline" className="ml-1 text-[10px]">🔋 bat.</Badge>
                  )}
                  {(p.archivos?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setViewFilesProduct(p); }}
                      title="Ver archivos adjuntos"
                    >
                      <Badge variant="secondary" className="ml-1 text-[10px] cursor-pointer hover:bg-secondary/80">
                        📎 {p.archivos!.length}
                      </Badge>
                    </button>
                  )}
                  {p.especificacion && (
                    <div className="text-xs text-muted-foreground mt-0.5">{p.especificacion}</div>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{allCategories[p.categoria] ?? p.categoria}</span>
                </TableCell>
                <TableCell className="text-right">{p.cantidad}</TableCell>
                <TableCell className="text-right">{fmt(p.precio_usd_total ?? p.precio_usd)}</TableCell>
                <TableCell className="text-right">{p.tax_pct > 0 ? `${p.tax_pct}%` : '—'}</TableCell>
                <TableCell className="text-right font-medium">
                  {fmt(p.precio_bs_pagado_total != null ? p.precio_bs_pagado_total : calcPrecioBs(p, s.tc_paralelo) * p.cantidad)}
                  {p.tc_producto && (
                    <span className="block text-[10px] text-success font-normal">T/C: {p.tc_producto.toFixed(4)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{p.ga_pct}%</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.fecha_compra}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingProduct({ ...p })}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeProduct(p.id)}
                        disabled={s.products.length <= 1}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingProduct && (
        <ProductEditDialog
          product={editingProduct}
          tcParalelo={s.tc_paralelo}
          shipmentId={s.id}
          companyId={activeCompanyId}
          onSave={saveProduct}
          onCancel={() => setEditingProduct(null)}
        />
      )}

      {viewFilesProduct && (
        <Dialog open onOpenChange={open => { if (!open) setViewFilesProduct(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">
                Archivos adjuntos — {viewFilesProduct.nombre}
              </DialogTitle>
            </DialogHeader>
            <div className="pt-1">
              <FileAttachments
                storagePath={`${activeCompanyId}/${s.id}/productos/${viewFilesProduct.id}`}
                files={viewFilesProduct.archivos ?? []}
                onChange={() => {}}
                disabled
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Dialog de edición de producto ────────────────────────────────────────────

function ProductEditDialog({ product, tcParalelo, shipmentId, companyId, onSave, onCancel }: {
  product: ShipmentProduct;
  tcParalelo: number;
  shipmentId: string;
  companyId: string;
  onSave: (p: ShipmentProduct) => void;
  onCancel: () => void;
}) {
  const allCategories = getAllCategories();
  const [p, setP] = useState<ShipmentProduct>(product);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  function update(patch: Partial<ShipmentProduct>) {
    setP(prev => {
      const next = { ...prev, ...patch };

      // Recalcular T/C siempre desde los valores más precisos disponibles
      const totalUsd  = next.precio_usd_total  ?? (next.precio_usd  * next.cantidad);
      const totalBs   = next.precio_bs_pagado_total ?? (next.precio_bs_pagado ? next.precio_bs_pagado * next.cantidad : null);

      // Si cambia total USD → limpiar unitario USD
      if ('precio_usd_total' in patch) next.precio_usd = 0;
      // Si cambia unitario USD → limpiar total USD
      if ('precio_usd' in patch)       next.precio_usd_total = undefined;
      // Si cambia total Bs → limpiar unitario Bs
      if ('precio_bs_pagado_total' in patch) next.precio_bs_pagado = undefined;
      // Si cambia unitario Bs → limpiar total Bs
      if ('precio_bs_pagado' in patch)       next.precio_bs_pagado_total = undefined;

      // Recalcular T/C
      if (totalUsd > 0 && totalBs && totalBs > 0) {
        next.tc_producto = round2(totalBs / totalUsd);
      } else {
        next.tc_producto = undefined;
      }
      return next;
    });
  }

  function handleCategorySelect(value: string) {
    if (value === '__nueva__') {
      setNewCategoryName('');
      setShowCategoryDialog(true);
    } else {
      update({ categoria: value });
    }
  }

  function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    const slug = newCategoryName.toLowerCase().replace(/\s+/g, '_');
    saveCustomCategory(slug, newCategoryName);
    update({ categoria: slug });
    setShowCategoryDialog(false);
    setNewCategoryName('');
    toast.success(`Categoría "${newCategoryName}" creada`);
  }

  const tcEfectivo = p.tc_producto ?? tcParalelo;
  const precioBsDisplay = calcPrecioBs(p, tcParalelo);

  return (
    <>
      <Dialog open onOpenChange={() => onCancel()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Fila 1: Nombre + especificación */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-5">
                <Label className="text-xs">Nombre del producto</Label>
                <Input value={p.nombre} onChange={e => update({ nombre: e.target.value })} placeholder="Samsung TAB S10 FE + KB (Refurb)" />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Especificación / Variante <span className="text-muted-foreground">(opcional)</span></Label>
                <Input value={p.especificacion ?? ''} onChange={e => update({ especificacion: e.target.value || undefined })} placeholder="256GB / WiFi + Chip" />
              </div>
              <div className="col-span-3 text-xs text-muted-foreground pb-2">
                Diferencia variantes del mismo modelo
              </div>
            </div>

            {/* Fila 2: categoría, cant, fecha, GA% */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-4">
                <Label className="text-xs">Categoría</Label>
                <Select value={p.categoria} onValueChange={handleCategorySelect}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(allCategories).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                    <SelectItem value="__nueva__">➕ Nueva categoría...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Cant.</Label>
                <Input type="number" min="1" value={p.cantidad}
                  onChange={e => update({ cantidad: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Fecha compra</Label>
                <Input type="date" value={p.fecha_compra}
                  onChange={e => update({ fecha_compra: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">GA %</Label>
                <Input type="number" min="0" value={p.ga_pct}
                  onChange={e => update({ ga_pct: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            {/* Fila 2: Precios USD (unitario o total) */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-3">
                <Label className="text-xs">Precio USD unitario <span className="text-muted-foreground">(sin tax)</span></Label>
                <Input type="number" step="0.01"
                  value={p.precio_usd_total ? '' : (p.precio_usd || '')}
                  disabled={!!(p.precio_usd_total && p.precio_usd_total > 0)}
                  placeholder={p.precio_usd_total ? '— usa total —' : '0.00'}
                  onChange={e => update({ precio_usd: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">
                  Total USD
                  <span className="text-muted-foreground ml-1">(para {p.cantidad} unid.)</span>
                </Label>
                <Input type="number" step="0.01"
                  value={p.precio_usd ? '' : (p.precio_usd_total || '')}
                  disabled={!!(p.precio_usd && p.precio_usd > 0)}
                  placeholder={p.precio_usd ? '— usa unitario —' : '0.00'}
                  onChange={e => update({ precio_usd_total: parseFloat(e.target.value) || undefined })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Tax %</Label>
                <Input type="number" min="0" step="0.1" value={p.tax_pct}
                  onChange={e => update({ tax_pct: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="col-span-4">
                <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Unitario:</span>
                  <span className="font-medium text-foreground">
                    {(p.precio_usd_total || p.precio_usd)
                      ? fmt(p.precio_usd_total ? p.precio_usd_total / p.cantidad : p.precio_usd) + ' USD'
                      : '—'}
                  </span>
                  <span className="mx-1">·</span>
                  <span>Total:</span>
                  <span className="font-medium text-foreground">
                    {(p.precio_usd_total || p.precio_usd)
                      ? fmt(p.precio_usd_total ?? p.precio_usd * p.cantidad) + ' USD'
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Fila 3: Precios Bs pagados (unitario o total) + T/C + resultado */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-3">
                <Label className="text-xs">
                  Precio Bs unitario
                  <span className="text-muted-foreground ml-1">(opcional si usas total)</span>
                </Label>
                <Input type="number" step="0.01"
                  value={p.precio_bs_pagado_total ? '' : (p.precio_bs_pagado || '')}
                  disabled={!!(p.precio_bs_pagado_total && p.precio_bs_pagado_total > 0)}
                  placeholder={p.precio_bs_pagado_total ? '— usa total —' : '0.00'}
                  onChange={e => update({ precio_bs_pagado: parseFloat(e.target.value) || undefined })} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">
                  Total Bs pagado
                  <span className="text-muted-foreground ml-1">(para {p.cantidad} unid.)</span>
                </Label>
                <Input type="number" step="0.01"
                  value={p.precio_bs_pagado ? '' : (p.precio_bs_pagado_total || '')}
                  disabled={!!(p.precio_bs_pagado && p.precio_bs_pagado > 0)}
                  placeholder={p.precio_bs_pagado ? '— usa unitario —' : '0.00'}
                  onChange={e => update({ precio_bs_pagado_total: parseFloat(e.target.value) || undefined })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">T/C calculado</Label>
                <div className={`h-9 px-3 rounded-md border flex items-center text-sm font-medium ${
                  p.tc_producto ? 'bg-success/10 border-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {p.tc_producto ? p.tc_producto.toFixed(4) : `≈ ${tcParalelo} (ref.)`}
                </div>
              </div>
              <div className="col-span-4">
                <div className="h-9 px-3 rounded-md border bg-primary/5 border-primary/20 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Total Bs:</span>
                  <span className="font-bold text-sm text-primary">
                    {fmt(p.precio_bs_pagado_total ?? calcPrecioBs(p, tcParalelo) * p.cantidad)}
                  </span>
                </div>
              </div>
            </div>

            {/* Fila 3: Batería + BOB tributos en la misma línea */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-bateria"
                  checked={p.tiene_bateria}
                  onChange={e => update({ tiene_bateria: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="edit-bateria" className="text-sm cursor-pointer">🔋 Certificado de batería</Label>
                {p.tiene_bateria && (
                  <div className="flex items-center gap-2 ml-4">
                    <Label className="text-xs text-muted-foreground">Costo (Bs):</Label>
                    <Input type="number" step="0.01" value={p.costo_bateria || ''}
                      onChange={e => update({ costo_bateria: parseFloat(e.target.value) || 0 })}
                      className="h-8 w-28" />
                  </div>
                )}
              </div>
              {p.precio_usd > 0 && (
                <p className="text-xs text-muted-foreground">
                  BOB para tributos: <strong>{fmt(round2(p.precio_usd * 6.97))}</strong>
                </p>
              )}
            </div>

            {/* Documentos adjuntos del producto */}
            <div>
              <Label className="text-xs mb-1.5 block">Documentos adjuntos (facturas, invoices, etc.)</Label>
              <FileAttachments
                storagePath={`${companyId}/${shipmentId}/productos/${p.id}`}
                files={p.archivos ?? []}
                onChange={archivos => update({ archivos })}
                label="Adjuntar documento"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button onClick={() => onSave(p)} disabled={!p.nombre.trim()}>
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog crear categoría */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva Categoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre de la categoría</Label>
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Ej: Textiles, Ferretería..."
                onKeyDown={e => e.key === 'Enter' && handleCreateCategory()} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancelar</Button>
              <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>Crear Categoría</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Tab: Flete ────────────────────────────────────────────────────────────────

function FleteTab({ s, isReadOnly, onSave }: { s: Shipment; isReadOnly: boolean; onSave: (s: Shipment) => void }) {
  const canEdit = !isReadOnly && !['EN_ADUANA', 'EN_ALMACEN', 'CERRADO'].includes(s.status);
  const activeCompanyId = useActiveCompanyId();

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Recuerda registrar el pago en el Libro Diario</p>
            <p className="text-xs mt-0.5">El pago del flete debe registrarse como: <strong>G.2 Flete Aéreo / Banco</strong>. Al cerrar el embarque se generará automáticamente el asiento de capitalización.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div>
          <Label>Monto total del flete (Bs)</Label>
          <Input
            type="number" step="0.01"
            value={s.flete_total_bs ?? ''}
            onChange={e => canEdit && onSave({ ...s, flete_total_bs: parseFloat(e.target.value) || 0 })}
            disabled={!canEdit}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>Fecha de pago</Label>
          <Input
            type="date"
            value={s.flete_fecha ?? ''}
            onChange={e => canEdit && onSave({ ...s, flete_fecha: e.target.value })}
            disabled={!canEdit}
          />
        </div>
      </div>

      {s.flete_total_bs && s.flete_total_bs > 0 && (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
          El flete será prorrateado entre los {s.products.length} producto(s) según peso volumen al momento de cerrar el embarque.
        </div>
      )}

      {/* Documentos del flete */}
      <div>
        <Label className="text-xs mb-1.5 block">Documentos del flete (AWB, invoice courier, etc.)</Label>
        <FileAttachments
          storagePath={`${activeCompanyId}/${s.id}/flete`}
          files={s.flete_archivos ?? []}
          onChange={flete_archivos => onSave({ ...s, flete_archivos })}
          disabled={isReadOnly}
          label="Adjuntar documento"
        />
      </div>
    </div>
  );
}

// ─── Tab: Aduana ───────────────────────────────────────────────────────────────

function AduanaTab({ s, isReadOnly, onSave }: { s: Shipment; isReadOnly: boolean; onSave: (s: Shipment) => void }) {
  const canEditTributos = !isReadOnly && s.status === 'EN_ADUANA';
  const canEditGastos   = !isReadOnly && ['EN_ADUANA', 'EN_ALMACEN'].includes(s.status);
  const activeCompanyId = useActiveCompanyId();

  function updateProduct(id: string, patch: Partial<ShipmentProduct>) {
    onSave({ ...s, products: s.products.map(p => p.id === id ? { ...p, ...patch } : p) });
  }
  function addGasto() {
    const g: ShipmentExpense = { id: crypto.randomUUID(), shipment_id: s.id, concepto: '', monto: 0, fecha: todayISO() };
    onSave({ ...s, gastos_aduana: [...s.gastos_aduana, g] });
  }
  function updateGasto(id: string, patch: Partial<ShipmentExpense>) {
    onSave({ ...s, gastos_aduana: s.gastos_aduana.map(g => g.id === id ? { ...g, ...patch } : g) });
  }
  function removeGasto(id: string) {
    onSave({ ...s, gastos_aduana: s.gastos_aduana.filter(g => g.id !== id) });
  }

  const totalGA = round2(s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0));
  const totalIVA = round2(s.products.reduce((sum, p) => sum + (p.iva_monto ?? 0), 0));
  const totalManipuleo = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));

  return (
    <div className="space-y-5">
      {/* Tributos del DIM */}
      <div>
        <div className="flex items-start justify-between mb-2 gap-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Tributos Aduaneros (DIM)
          </h3>
          <div className="flex-1 max-w-sm">
            <FileAttachments
              storagePath={`${activeCompanyId}/${s.id}/aduana/dim`}
              files={s.dim_archivos ?? []}
              onChange={dim_archivos => onSave({ ...s, dim_archivos })}
              disabled={isReadOnly}
              label="Adjuntar DIM"
              compact
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Ingresa los montos exactos del DIM. El GA capitaliza a Inventario en Tránsito; el IVA va a Crédito Fiscal IVA.
        </p>
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
          ⚠️ Ingresa el <strong>monto total del DIM</strong> para todas las unidades del producto (no dividas por cantidad — el sistema lo hace automáticamente).
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">
                Total GA Bs
                <span className="block text-[10px] font-normal text-muted-foreground">(todas las unidades)</span>
              </TableHead>
              <TableHead className="text-right">
                Total IVA Bs
                <span className="block text-[10px] font-normal text-muted-foreground">(todas las unidades)</span>
              </TableHead>
              <TableHead className="text-right">Total Tributos</TableHead>
              <TableHead className="text-right text-muted-foreground text-xs">GA estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.products.map(p => {
              const gaEst = calcGAEstimado(p, s.tc_oficial,
                p.precio_usd > 0 ? round2(calcPesoEfectivo(p) ?? 0 * 11 * s.tc_paralelo) : 0);
              const gaUnitario = p.ga_monto != null ? round2(p.ga_monto / p.cantidad) : null;
              const ivaUnitario = p.iva_monto != null ? round2(p.iva_monto / p.cantidad) : null;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-sm">
                    {p.nombre}
                    {p.cantidad > 1 && (
                      <span className="text-muted-foreground font-normal"> ×{p.cantidad}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEditTributos ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Input type="number" step="0.01" className="h-8 w-28 text-right"
                          value={p.ga_monto ?? ''}
                          onChange={e => updateProduct(p.id, {
                            ga_monto: e.target.value === '' ? undefined : parseFloat(e.target.value)
                          })}
                          placeholder="0.00" />
                        {gaUnitario != null && p.cantidad > 1 && (
                          <span className="text-[10px] text-muted-foreground">= {fmt(gaUnitario)}/u</span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span>{p.ga_monto != null ? fmt(p.ga_monto) : '—'}</span>
                        {gaUnitario != null && p.cantidad > 1 && (
                          <span className="block text-[10px] text-muted-foreground">{fmt(gaUnitario)}/u</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEditTributos ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Input type="number" step="0.01" className="h-8 w-28 text-right"
                          value={p.iva_monto ?? ''}
                          onChange={e => updateProduct(p.id, {
                            iva_monto: e.target.value === '' ? undefined : parseFloat(e.target.value)
                          })}
                          placeholder="0.00" />
                        {ivaUnitario != null && p.cantidad > 1 && (
                          <span className="text-[10px] text-muted-foreground">= {fmt(ivaUnitario)}/u</span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span>{p.iva_monto != null ? fmt(p.iva_monto) : '—'}</span>
                        {ivaUnitario != null && p.cantidad > 1 && (
                          <span className="block text-[10px] text-muted-foreground">{fmt(ivaUnitario)}/u</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(p.ga_monto != null && p.iva_monto != null)
                      ? fmt(round2(p.ga_monto + p.iva_monto))
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    ≈ {fmt(gaEst * p.cantidad)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{fmt(totalGA)}</TableCell>
              <TableCell className="text-right">{fmt(totalIVA)}</TableCell>
              <TableCell className="text-right">{fmt(round2(totalGA + totalIVA))}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Separator />

      {/* Gastos de aduana / Manipuleo */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Warehouse className="w-4 h-4" />
            Gastos de Aduana / Manipuleo
          </h3>
          {canEditGastos && (
            <Button size="sm" variant="outline" onClick={addGasto}>
              <Plus className="w-4 h-4 mr-1" />Agregar gasto
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Almacenaje, Examen Previo, SUMA, Agencia despachante. Se prorratean por peso. Puedes agregar gastos también en estado En Almacén.
        </p>

        {s.gastos_aduana.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            No hay gastos registrados
          </div>
        ) : (
          <div className="space-y-2">
            {s.gastos_aduana.map(g => (
              <div key={g.id} className="p-2 bg-muted/30 rounded-lg space-y-1.5">
                <div className="flex items-center gap-3">
                  {canEditGastos ? (
                    <>
                      <Input value={g.concepto} placeholder="Concepto (ej: Almacenaje)"
                        onChange={e => updateGasto(g.id, { concepto: e.target.value })}
                        className="flex-1 h-8" />
                      <Input type="date" value={g.fecha}
                        onChange={e => updateGasto(g.id, { fecha: e.target.value })}
                        className="w-36 h-8" />
                      <Input type="number" step="0.01" value={g.monto || ''}
                        onChange={e => updateGasto(g.id, { monto: parseFloat(e.target.value) || 0 })}
                        placeholder="Monto Bs" className="w-32 h-8 text-right" />
                      <Button size="sm" variant="ghost" onClick={() => removeGasto(g.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{g.concepto}</span>
                      <span className="text-xs text-muted-foreground">{g.fecha}</span>
                      <span className="font-medium text-sm">{fmt(g.monto)} Bs</span>
                    </>
                  )}
                </div>
                <FileAttachments
                  storagePath={`${activeCompanyId}/${s.id}/aduana/gastos/${g.id}`}
                  files={g.archivos ?? []}
                  onChange={archivos => updateGasto(g.id, { archivos })}
                  disabled={isReadOnly}
                  label="Adjuntar"
                  compact
                />
              </div>
            ))}
            <div className="flex justify-end pr-10 pt-1">
              <span className="text-sm font-semibold">Total manipuleo: {fmt(totalManipuleo)} Bs</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Medidas ──────────────────────────────────────────────────────────────

function MedidasTab({ s, isReadOnly, onSave }: { s: Shipment; isReadOnly: boolean; onSave: (s: Shipment) => void }) {
  const canEdit = !isReadOnly && s.status === 'EN_ALMACEN';
  const metodo = s.metodo_peso ?? 'automatico';

  function updateProduct(id: string, patch: Partial<ShipmentProduct>) {
    onSave({ ...s, products: s.products.map(p => p.id === id ? { ...p, ...patch } : p) });
  }

  const METODO_LABELS = {
    automatico:    'Automático (el mayor)',
    peso_volumen:  'Solo peso volumen',
    peso_bruto:    'Solo peso bruto',
  };

  return (
    <div className="space-y-4">
      {/* Selector de método de peso */}
      <div className="bg-muted/40 border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold mb-0.5">Método de peso para prorrateo</p>
          <p className="text-xs text-muted-foreground">
            Define qué peso se usa para distribuir el flete y el manipuleo entre productos.
            Si eliges "Solo peso volumen" o "Solo peso bruto", el otro valor se ignora aunque esté ingresado.
          </p>
        </div>
        <Select
          value={metodo}
          onValueChange={v => canEdit && onSave({ ...s, metodo_peso: v as Shipment['metodo_peso'] })}
          disabled={!canEdit}
        >
          <SelectTrigger className="w-52 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="automatico">⚖️ Automático (el mayor)</SelectItem>
            <SelectItem value="peso_volumen">📦 Solo peso volumen</SelectItem>
            <SelectItem value="peso_bruto">🏋️ Solo peso bruto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-info/10 border border-info/20 rounded-lg p-3 text-sm text-info">
        <p className="font-medium">Mide los productos en tu almacén</p>
        <p className="text-xs mt-0.5">
          Ingresa las dimensiones y peso del <strong>paquete completo</strong> de cada producto
          (no por unidad). El flete y manipuleo se prorratean según esos pesos totales.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">M1 (cm)</TableHead>
            <TableHead className="text-right">M2 (cm)</TableHead>
            <TableHead className="text-right">M3 (cm)</TableHead>
            <TableHead className="text-right">Peso bruto (kg)</TableHead>
            <TableHead className="text-right">Batería (Bs)</TableHead>
            <TableHead className="text-right">Peso vol.</TableHead>
            <TableHead className="text-right">
              Peso usado
              <span className="block text-[10px] font-normal text-muted-foreground">{METODO_LABELS[metodo]}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.products.map(p => {
            const pv = calcPesoVolumen(p);
            const pe = getPesoEfectivoPorMetodo(p, metodo);
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-sm">
                  {p.nombre} {p.tiene_bateria && <Badge variant="outline" className="ml-1 text-[10px]">🔋</Badge>}
                  <span className="text-muted-foreground font-normal"> ×{p.cantidad}</span>
                </TableCell>
                {(['m1', 'm2', 'm3'] as const).map(dim => (
                  <TableCell key={dim} className="text-right">
                    {canEdit ? (
                      <Input type="number" step="0.1" className="h-8 w-20 text-right ml-auto"
                        value={p[dim] ?? ''}
                        onChange={e => updateProduct(p.id, { [dim]: parseFloat(e.target.value) || undefined })}
                        placeholder="0" />
                    ) : <span>{p[dim] ?? '—'}</span>}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {canEdit ? (
                    <Input type="number" step="0.01" className="h-8 w-24 text-right ml-auto"
                      value={p.peso_bruto ?? ''}
                      onChange={e => updateProduct(p.id, { peso_bruto: parseFloat(e.target.value) || undefined })}
                      placeholder="0.00" />
                  ) : <span>{p.peso_bruto ?? '—'}</span>}
                </TableCell>
                <TableCell className="text-right">
                  {p.tiene_bateria && canEdit ? (
                    <Input type="number" step="0.01" className="h-8 w-24 text-right ml-auto"
                      value={p.costo_bateria || ''}
                      onChange={e => updateProduct(p.id, { costo_bateria: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00" />
                  ) : p.tiene_bateria ? (
                    <span className="font-medium">{fmt(p.costo_bateria)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {pv != null ? <span className="font-medium">{pv}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {pe != null ? <span className="font-semibold text-primary">{pe} kg</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Tab: Costos Finales ───────────────────────────────────────────────────────

function CostosFinalesTab({ s }: { s: Shipment }) {
  const allCategories = getAllCategories();
  const costos = calcCostoFinalPorProducto(s);
  const [showWithIVA, setShowWithIVA] = useState(false);

  // Total por filas (suma de costos unitarios × cantidad) — valor del Kárdex
  const totalFilas = round2(costos.reduce((sum, { product, costo_unitario, detalle }) => {
    const unit = costo_unitario + (showWithIVA ? detalle.iva : 0);
    return sum + unit * product.cantidad;
  }, 0));

  // Total exacto desde los componentes originales — evita acumulación de redondeos
  const totalProductosExacto = round2(s.products.reduce((sum, p) => sum + calcTotalBsProducto(p, s.tc_paralelo), 0));
  const totalGAExacto        = round2(s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0));
  const totalIVAExacto       = round2(s.products.reduce((sum, p) => sum + (p.iva_monto ?? 0), 0));
  const totalManipuleoExacto = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));
  const totalBateriasExacto  = round2(s.products.reduce((sum, p) => sum + (p.tiene_bateria ? p.costo_bateria : 0), 0));
  const totalExacto = round2(
    totalProductosExacto +
    (s.flete_total_bs ?? 0) +
    totalGAExacto +
    (showWithIVA ? totalIVAExacto : 0) +
    totalManipuleoExacto +
    totalBateriasExacto
  );

  const hayDiferencia = Math.abs(totalExacto - totalFilas) >= 0.01;

  return (
    <div className="space-y-4">
      <div className="bg-success/10 border border-success/20 rounded-lg p-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-success shrink-0" />
        <div className="text-sm text-success">
          <span className="font-medium">Embarque cerrado. </span>
          Se generaron {s.journal_entry_ids?.length ?? 0} asientos contables automáticamente.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {showWithIVA
            ? 'Mostrando costo unitario + IVA (informativo — no es el costo contable registrado en Kárdex).'
            : 'Costo contable registrado en Kárdex (sin IVA, ya que es Crédito Fiscal).'}
        </p>
        <Button
          size="sm"
          variant={showWithIVA ? 'default' : 'outline'}
          onClick={() => setShowWithIVA(v => !v)}
        >
          {showWithIVA ? 'Ver costo sin IVA (contable)' : 'Ver costo + IVA'}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cant.</TableHead>
            <TableHead className="text-right">Precio Bs</TableHead>
            <TableHead className="text-right">Flete/u</TableHead>
            <TableHead className="text-right">GA/u</TableHead>
            <TableHead className={`text-right ${showWithIVA ? 'font-semibold text-primary' : ''}`}>
              IVA/u{showWithIVA ? ' ✓' : ''}
            </TableHead>
            <TableHead className="text-right">Manipuleo/u</TableHead>
            <TableHead className="text-right font-semibold">
              Costo unitario{showWithIVA ? ' (+IVA)' : ''}
            </TableHead>
            <TableHead className="text-right font-semibold">Costo total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {costos.map(({ product: p, costo_unitario, detalle }) => {
            const unit = costo_unitario + (showWithIVA ? detalle.iva : 0);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">{allCategories[p.categoria] ?? p.categoria}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right">{p.cantidad}</TableCell>
                <TableCell className="text-right">{fmt(detalle.precioBs)}</TableCell>
                <TableCell className="text-right">{fmt(detalle.envioUnitario)}</TableCell>
                <TableCell className="text-right">{fmt(detalle.ga)}</TableCell>
                <TableCell className={`text-right ${showWithIVA ? 'font-semibold text-primary' : ''}`}>{fmt(detalle.iva)}</TableCell>
                <TableCell className="text-right">{fmt(detalle.manipuleo)}</TableCell>
                <TableCell className="text-right font-semibold text-primary">{fmt(unit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(round2(unit * p.cantidad))}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="font-bold bg-muted/30">
            <TableCell colSpan={8} className="text-right">
              TOTAL EMBARQUE{showWithIVA ? ' (con IVA)' : ''}
            </TableCell>
            <TableCell className="text-right">
              {fmt(totalExacto)} Bs
              {hayDiferencia && (
                <span
                  className="block text-[10px] font-normal text-muted-foreground"
                  title={`Suma de filas: ${fmt(totalFilas)} Bs. Diferencia de ${fmt(Math.abs(totalExacto - totalFilas))} Bs por redondeo en costos unitarios.`}
                >
                  ∑ filas: {fmt(totalFilas)} Bs ⓘ
                </span>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
