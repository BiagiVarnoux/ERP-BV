import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, ShoppingCart, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { fmt, todayISO, round2 } from '@/accounting/utils';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import {
  calculateTaxes,
  createSale,
  loadPaymentMethods,
  CANAL_LABELS,
  type Canal,
  type TipoPago,
  type SaleItemInput,
  type MetodoValuacion,
  type SaleItemEnriched,
  type PaymentMethod,
} from '@/domain/sales';
import { fetchProductsStockBatch, fetchLastPricesByCanal } from '@/domain/sales/stockService';
import { condicionLabel } from '@/accounting/product-condicion';
import { CustomerSearchCombobox } from '@/components/customers/CustomerSearchCombobox';

interface VendedorOption {
  member_id: string;
  display_name: string;
  email: string;
  role: string;
}

interface ProductOption {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  especificacion: string | null;
  unidad_medida: string;
  cuenta_inventario_id: string | null;
  metodo_valuacion: MetodoValuacion;
  precio_minimo: number | null;
  condicion: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function NuevaVentaModal({ isOpen, onClose, onSaved }: Props) {
  const { reloadEntries } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, { stock: number; cpp: number }>>({});
  const [suggestedPrices, setSuggestedPrices] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmStockOpen, setConfirmStockOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Header
  const [fecha, setFecha] = useState(todayISO());
  const [canal, setCanal] = useState<Canal>('electronica');
  const [conFactura, setConFactura] = useState(false);
  const [tipoPago, setTipoPago] = useState<string>('caja_mn');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [glosa, setGlosa] = useState('');
  const [vendedorId, setVendedorId] = useState<string>('');
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);

  // Items
  const [items, setItems] = useState<SaleItemEnriched[]>([]);

  // Buscador
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    loadProductsAndStock();
    if (activeCompanyId) {
      loadPaymentMethods(activeCompanyId).then(setPaymentMethods).catch(() => {});
      supabase.rpc('get_company_members_detail', { p_company_id: activeCompanyId })
        .then(({ data }) => setVendedores(((data ?? []) as VendedorOption[]).filter(m => m.role === 'custom')))
        .catch(() => setVendedores([]));
    }
  }, [isOpen]);

  // Actualizar precios sugeridos cuando cambia el canal
  useEffect(() => {
    if (!products.length) return;
    fetchLastPricesByCanal(products.map(p => p.id), canal).then(setSuggestedPrices);
  }, [canal, products]);

  // CxC del sistema: cada canal muestra solo su CxC específica
  const CXC_BY_CANAL: Record<Canal, string> = {
    electronica: 'cxc_electronica',
    pedido: 'cxc_pedido',
    licitacion: 'cxc_licitaciones',
    general: 'cxc',
  };
  const CXC_SISTEMA = new Set(['cxc', 'cxc_electronica', 'cxc_pedido', 'cxc_licitaciones']);

  const tipoPagoOptions = useMemo<PaymentMethod[]>(() => {
    const cxcForCanal = CXC_BY_CANAL[canal];
    return paymentMethods.filter(m =>
      m.enabled && (!CXC_SISTEMA.has(m.tipo_pago) || m.tipo_pago === cxcForCanal)
    );
  }, [canal, paymentMethods]);

  // Resetear tipo_pago si ya no es válido para el nuevo canal
  useEffect(() => {
    if (CXC_SISTEMA.has(tipoPago) && tipoPago !== CXC_BY_CANAL[canal]) {
      setTipoPago('caja_mn');
    }
  }, [canal]);

  function resetForm() {
    setFecha(todayISO());
    setCanal('electronica');
    setConFactura(false);
    setTipoPago('caja_mn');
    setCustomerId(null);
    setCustomerName('');
    setGlosa('');
    setVendedorId('');
    setItems([]);
    setSearchQuery('');
    setSearchOpen(false);
    setSuggestedPrices({});
  }

  async function loadProductsAndStock() {
    setLoadingProducts(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, codigo, nombre, descripcion, categoria, especificacion, unidad_medida, cuenta_inventario_id, metodo_valuacion, precio_minimo, condicion')
        .eq('company_id', activeCompanyId)
        .eq('status', 'activo')
        .order('nombre');
      const prods = (data ?? []) as ProductOption[];
      setProducts(prods);

      const ids = prods.map(p => p.id);
      const [sm, sp] = await Promise.all([
        fetchProductsStockBatch(ids, activeCompanyId),
        fetchLastPricesByCanal(ids, canal),
      ]);
      setStockMap(sm);
      setSuggestedPrices(sp);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando productos');
    } finally {
      setLoadingProducts(false);
    }
  }

  // Cierra el dropdown de búsqueda al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return products
      .filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, searchQuery]);

  function addProduct(product: ProductOption) {
    const existing = items.find(it => it.product_id === product.id);
    if (existing) {
      updateItem(existing._key, { cantidad: existing.cantidad + 1 });
    } else {
      const stockInfo = stockMap[product.id] ?? null;
      const precioSugerido = suggestedPrices[product.id] ?? 0;
      const newItem: SaleItemEnriched = {
        _key: Math.random().toString(36).slice(2),
        product_id: product.id,
        product_nombre: product.nombre,
        product_codigo: product.codigo,
        cuenta_inventario_id: product.cuenta_inventario_id,
        metodo_valuacion: product.metodo_valuacion,
        cantidad: 1,
        precio_lista: precioSugerido,
        descuento_pct: 0,
        precio_unitario_neto: precioSugerido,
        unidad_medida: product.unidad_medida,
        descripcion: product.descripcion,
        categoria: product.categoria,
        precio_minimo: product.precio_minimo,
        stock_disponible: stockInfo?.stock ?? null,
        cpp_unitario: stockInfo?.cpp ?? null,
        margen_unitario: null,
        margen_porcentaje: null,
      };
      // Calcular margen inicial si hay precio sugerido
      if (precioSugerido > 0 && stockInfo?.cpp) {
        newItem.margen_unitario = round2(precioSugerido - stockInfo.cpp);
        newItem.margen_porcentaje = round2((newItem.margen_unitario / precioSugerido) * 100);
      }
      setItems(prev => [...prev, newItem]);
    }
    setSearchQuery('');
    setSearchOpen(false);
  }

  function updateItem(key: string, patch: Partial<SaleItemEnriched>) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it;
      const updated = { ...it, ...patch };

      // Recalcular precio neto si cambia lista o descuento
      if ('precio_lista' in patch || 'descuento_pct' in patch) {
        updated.precio_unitario_neto = round2(
          updated.precio_lista * (1 - updated.descuento_pct / 100)
        );
      }

      // Recalcular margen
      if (updated.cpp_unitario !== null && updated.precio_unitario_neto > 0) {
        updated.margen_unitario = round2(updated.precio_unitario_neto - updated.cpp_unitario);
        updated.margen_porcentaje = round2(
          (updated.margen_unitario / updated.precio_unitario_neto) * 100
        );
      } else {
        updated.margen_unitario = null;
        updated.margen_porcentaje = null;
      }
      return updated;
    }));
  }

  const extendedTotals = useMemo(() => {
    const taxes = calculateTaxes(items, conFactura);
    const costoTotal = items.reduce((sum, it) => {
      if (it.cpp_unitario === null) return sum;
      return sum + round2(it.cpp_unitario * it.cantidad);
    }, 0);
    const tieneEstimados = items.some(it => it.cpp_unitario === null && it.product_id);
    const margenBruto = round2(taxes.precio_neto_total - costoTotal);
    const margenPct = taxes.precio_neto_total > 0
      ? round2((margenBruto / taxes.precio_neto_total) * 100)
      : 0;
    return { ...taxes, costoTotal, margenBruto, margenPct, tieneEstimados };
  }, [items, conFactura]);

  function canSubmit() {
    if (items.length === 0) return false;
    return items.every(it => it.product_id && it.cantidad > 0 && it.precio_unitario_neto > 0);
  }

  const itemsWithInsufficientStock = useMemo(
    () => items.filter(it => it.stock_disponible !== null && it.cantidad > it.stock_disponible),
    [items]
  );

  function handleSubmitClick() {
    if (itemsWithInsufficientStock.length > 0) {
      setConfirmStockOpen(true);
    } else {
      doSubmit();
    }
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      const cleanItems: SaleItemInput[] = items.map(({
        _key, stock_disponible, cpp_unitario, margen_unitario, margen_porcentaje,
        precio_lista, descuento_pct, unidad_medida, descripcion, categoria, precio_minimo,
        ...rest
      }) => rest);
      const result = await createSale(
        {
          fecha,
          canal,
          con_factura: conFactura,
          tipo_pago: tipoPago,
          cliente_nombre: customerName || null,
          glosa: glosa || null,
          vendedor_member_id: vendedorId || null,
        },
        cleanItems,
        activeCompanyId,
        Object.fromEntries(paymentMethods.map(m => [m.tipo_pago, m.account_codigo])),
      );
      toast.success(`Venta ${result.numero} registrada`);
      await reloadEntries();
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la venta');
    } finally {
      setSubmitting(false);
    }
  }

  function stockColor(stock: number) {
    if (stock >= 5) return 'text-green-600';
    if (stock >= 1) return 'text-amber-600';
    return 'text-red-600';
  }

  function margenBadgeClass(pct: number) {
    if (pct < 5) return 'bg-red-100 text-red-700 border-red-300';
    if (pct < 20) return 'bg-amber-100 text-amber-700 border-amber-300';
    return 'bg-green-100 text-green-700 border-green-300';
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={o => !o && !submitting && onClose()}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Nueva Venta
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-6 items-start">
            {/* ── Columna izquierda: productos ── */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Buscador de productos */}
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  {loadingProducts ? (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nombre o código..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    disabled={loadingProducts}
                  />
                </div>
                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-y-auto">
                    {searchResults.map(p => {
                      const si = stockMap[p.id];
                      const sp = suggestedPrices[p.id];
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm border-b last:border-0"
                          onMouseDown={e => { e.preventDefault(); addProduct(p); }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground font-mono">{p.codigo}</span>
                                <span className="font-medium truncate">{p.nombre}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {p.condicion && (
                                  <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">
                                    {condicionLabel(p.condicion)}
                                  </span>
                                )}
                                {p.especificacion && (
                                  <span className="text-xs text-muted-foreground">{p.especificacion}</span>
                                )}
                                <span className="text-xs text-muted-foreground">{p.unidad_medida}</span>
                                {p.descripcion && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    — {p.descripcion}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right space-y-0.5">
                              {si !== undefined ? (
                                <div className={`text-xs font-medium ${stockColor(si.stock)}`}>
                                  Stock: {si.stock} {p.unidad_medida}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">Sin stock</div>
                              )}
                              {sp !== undefined && (
                                <div className="text-xs text-blue-600 font-medium">
                                  Último: Bs {fmt(sp)}
                                </div>
                              )}
                              {si && si.cpp > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  CPP: Bs {fmt(si.cpp)}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tabla de ítems */}
              {items.length > 0 && (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Producto</TableHead>
                        <TableHead className="w-16 text-right">Cant.</TableHead>
                        <TableHead className="w-28 text-right">Precio Lista</TableHead>
                        <TableHead className="w-20 text-right">Desc. %</TableHead>
                        <TableHead className="w-28 text-right">Precio Neto</TableHead>
                        <TableHead className="w-24 text-right">CPP</TableHead>
                        <TableHead className="w-20 text-right">Margen %</TableHead>
                        <TableHead className="w-28 text-right">Subtotal</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(it => {
                        const subtotal = round2(it.cantidad * it.precio_unitario_neto);
                        const stockInsuf = it.stock_disponible !== null && it.cantidad > it.stock_disponible;
                        const belowCost = it.margen_porcentaje !== null && it.margen_porcentaje < 0;
                        const belowMinimo = it.precio_minimo !== null && it.precio_unitario_neto > 0
                          && it.precio_unitario_neto < it.precio_minimo;
                        const hasSuggested = suggestedPrices[it.product_id] !== undefined
                          && suggestedPrices[it.product_id] !== it.precio_lista;
                        return (
                          <React.Fragment key={it._key}>
                            <TableRow className={stockInsuf ? 'bg-amber-50/50' : ''}>
                              {/* Producto */}
                              <TableCell>
                                <div className="font-medium text-sm leading-tight">{it.product_nombre}</div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {it.product_codigo && (
                                    <span className="text-xs text-muted-foreground font-mono">{it.product_codigo}</span>
                                  )}
                                  {it.categoria && (
                                    <span className="text-xs text-muted-foreground bg-muted px-1 rounded">{it.categoria}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{it.unidad_medida}</span>
                                  {it.stock_disponible !== null && (
                                    <Badge variant="outline" className={`text-xs px-1 py-0 ${stockColor(it.stock_disponible)} border-current`}>
                                      {it.stock_disponible} u.
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>

                              {/* Cantidad */}
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  className="h-8 w-16 text-right"
                                  value={it.cantidad || ''}
                                  onChange={e => updateItem(it._key, { cantidad: parseFloat(e.target.value) || 0 })}
                                />
                              </TableCell>

                              {/* Precio Lista */}
                              <TableCell>
                                <div className="space-y-0.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    className="h-8 w-28 text-right"
                                    value={it.precio_lista || ''}
                                    onChange={e => updateItem(it._key, { precio_lista: parseFloat(e.target.value) || 0 })}
                                  />
                                  {hasSuggested && (
                                    <button
                                      type="button"
                                      className="text-xs text-blue-600 hover:underline w-full text-right leading-tight"
                                      onClick={() => updateItem(it._key, { precio_lista: suggestedPrices[it.product_id] })}
                                    >
                                      Último: {fmt(suggestedPrices[it.product_id])}
                                    </button>
                                  )}
                                </div>
                              </TableCell>

                              {/* Descuento % */}
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  className="h-8 w-20 text-right"
                                  value={it.descuento_pct || ''}
                                  placeholder="0"
                                  onChange={e => updateItem(it._key, { descuento_pct: parseFloat(e.target.value) || 0 })}
                                />
                              </TableCell>

                              {/* Precio Neto (derivado) */}
                              <TableCell className="text-right">
                                <div className="font-medium text-sm">
                                  Bs {fmt(it.precio_unitario_neto)}
                                </div>
                                {it.precio_minimo !== null && it.precio_unitario_neto > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    Mín: Bs {fmt(it.precio_minimo)}
                                  </div>
                                )}
                              </TableCell>

                              {/* CPP */}
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {it.cpp_unitario !== null ? `Bs ${fmt(it.cpp_unitario)}` : '—'}
                              </TableCell>

                              {/* Margen % */}
                              <TableCell className="text-right">
                                {it.margen_porcentaje !== null ? (
                                  <Badge variant="outline" className={`text-xs ${margenBadgeClass(it.margen_porcentaje)}`}>
                                    {it.margen_porcentaje.toFixed(1)}%
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Subtotal */}
                              <TableCell className="text-right font-medium text-sm">
                                Bs {fmt(subtotal)}
                              </TableCell>

                              {/* Eliminar */}
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setItems(prev => prev.filter(p => p._key !== it._key))}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>

                            {/* Filas de advertencia */}
                            {stockInsuf && (
                              <TableRow>
                                <TableCell colSpan={9} className="py-1 px-4">
                                  <p className="text-xs text-amber-700">
                                    ⚠ Stock insuficiente: disponible {it.stock_disponible} u.
                                  </p>
                                </TableCell>
                              </TableRow>
                            )}
                            {belowMinimo && (
                              <TableRow>
                                <TableCell colSpan={9} className="py-1 px-4">
                                  <p className="text-xs text-red-700">
                                    ✕ Precio por debajo del mínimo permitido (Bs {fmt(it.precio_minimo!)})
                                  </p>
                                </TableCell>
                              </TableRow>
                            )}
                            {belowCost && !belowMinimo && (
                              <TableRow>
                                <TableCell colSpan={9} className="py-1 px-4">
                                  <p className="text-xs text-red-700">
                                    ✕ Precio por debajo del costo
                                  </p>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {items.length === 0 && !loadingProducts && (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm border rounded-md border-dashed">
                  Busca y agrega productos usando el buscador de arriba
                </div>
              )}
            </div>

            {/* ── Columna derecha: cabecera + totales ── */}
            <div className="w-80 shrink-0 space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>Cliente</Label>
                  <CustomerSearchCombobox
                    value={customerId}
                    customerName={customerName}
                    onChange={(id, name) => { setCustomerId(id); setCustomerName(name); }}
                    disabled={submitting}
                  />
                </div>

                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Canal</Label>
                  <Select value={canal} onValueChange={(v: Canal) => setCanal(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CANAL_LABELS) as Canal[]).map(c => (
                        <SelectItem key={c} value={c}>{CANAL_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Tipo de Pago</Label>
                  <Select value={tipoPago} onValueChange={setTipoPago}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tipoPagoOptions.map(m => (
                        <SelectItem key={m.tipo_pago} value={m.tipo_pago}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Con Factura</Label>
                    <p className="text-xs text-muted-foreground">IVA 13% + IT 3%</p>
                  </div>
                  <Switch checked={conFactura} onCheckedChange={setConFactura} />
                </div>

                <div>
                  <Label>Glosa (opcional)</Label>
                  <Input
                    value={glosa}
                    onChange={e => setGlosa(e.target.value)}
                    placeholder="Descripción adicional..."
                  />
                </div>

                {vendedores.length > 0 && (
                  <div>
                    <Label>Vendedor (interno, opcional)</Label>
                    <Select value={vendedorId || '__ninguno__'} onValueChange={v => setVendedorId(v === '__ninguno__' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__ninguno__">Ninguno</SelectItem>
                        {vendedores.map(v => (
                          <SelectItem key={v.member_id} value={v.member_id}>{v.display_name || v.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Para calcular a quién pagarle comisión. No es visible en el Catálogo.</p>
                  </div>
                )}
              </div>

              {/* Cuadro de totales */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal neto</span>
                  <span className="font-mono">Bs {fmt(extendedTotals.precio_neto_total)}</span>
                </div>
                {conFactura && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IVA (13%)</span>
                      <span className="font-mono">Bs {fmt(extendedTotals.total_iva)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IT (3%)</span>
                      <span className="font-mono">Bs {fmt(extendedTotals.total_it)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t font-semibold">
                  <span>Total a cobrar</span>
                  <span className="font-mono">Bs {fmt(extendedTotals.total_cobrado)}</span>
                </div>

                {items.length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Costo total{extendedTotals.tieneEstimados ? ' ~' : ''}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        Bs {fmt(extendedTotals.costoTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Margen bruto{extendedTotals.tieneEstimados ? ' ~' : ''}
                      </span>
                      <span className={`font-mono ${extendedTotals.margenBruto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        Bs {fmt(extendedTotals.margenBruto)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Margen promedio</span>
                      <Badge variant="outline" className={margenBadgeClass(extendedTotals.margenPct)}>
                        {extendedTotals.margenPct.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitClick}
                  disabled={!canSubmit() || submitting}
                >
                  {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {submitting ? 'Registrando...' : 'Registrar Venta'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de stock insuficiente */}
      <AlertDialog open={confirmStockOpen} onOpenChange={setConfirmStockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stock insuficiente</AlertDialogTitle>
            <AlertDialogDescription>
              {itemsWithInsufficientStock.length} producto(s) tienen stock insuficiente. El sistema rechazará la venta si no hay unidades disponibles. ¿Continuar de todas formas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmStockOpen(false); doSubmit(); }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
