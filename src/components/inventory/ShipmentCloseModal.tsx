// src/components/inventory/ShipmentCloseModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowLeft, ArrowRight, Plus, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { fmt, round2 } from '@/accounting/utils';
import type { Shipment, ShipmentProduct } from '@/accounting/shipment-types';
import type { CostoDetalle } from '@/accounting/shipment-utils';
import { getAllCategories } from '@/accounting/shipment-utils';
import { RefreshCw } from 'lucide-react';
import {
  CONDICION_OPTIONS,
  TIPO_INVENTARIO_OPTIONS,
} from '@/accounting/product-condicion';
import { type ProductCategory, fetchNextSkuSequence, buildSku } from '@/components/inventory/NewProductModal';

export interface ProductLink {
  shipmentProductId: string;
  productId: string;        // existing product UUID or '' for new
  isNew: boolean;
  newProductData?: {
    nombre: string;
    codigo: string;
    cuenta_inventario_id: string;
    especificacion?: string;
    condicion?: string;
    category_id?: string;
    tipo_inventario?: string;
  };
}

export interface JournalPreview {
  memo: string;
  lines: Array<{ account_id: string; debit: number; credit: number; line_memo?: string }>;
}

interface Props {
  isOpen: boolean;
  shipment: Shipment;
  costos: Array<{ product: ShipmentProduct; costo_unitario: number; precioBsTotal: number; detalle: CostoDetalle }>;
  onConfirm: (links: ProductLink[], customMemos: string[]) => Promise<void>;
  onCancel: () => void;
}

interface SupaProduct {
  id: string;
  nombre: string;
  codigo: string;
  cuenta_inventario_id: string | null;
}

export function ShipmentCloseModal({ isOpen, shipment, costos, onConfirm, onCancel }: Props) {
  const { accounts } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const [tab, setTab] = useState<'link' | 'preview'>('link');
  const [links, setLinks] = useState<ProductLink[]>([]);
  const [supaProducts, setSupaProducts] = useState<SupaProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [generatingSku, setGeneratingSku] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [memos, setMemos] = useState<string[]>([]);

  const activoAccounts = useMemo(
    () => accounts.filter(a => a.type === 'ACTIVO' && a.is_active),
    [accounts]
  );

  // Load products from Supabase and auto-match
  useEffect(() => {
    if (!isOpen) return;
    setTab('link');
    loadProducts();
  }, [isOpen]);

  async function loadProducts() {
    const [prodsRes, catsRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, nombre, codigo, cuenta_inventario_id')
        .eq('company_id', activeCompanyId)
        .eq('status', 'activo'),
      supabase
        .from('product_categories')
        .select('id, company_id, nombre, codigo')
        .eq('company_id', activeCompanyId)
        .order('nombre'),
    ]);

    const prods = (prodsRes.data ?? []) as SupaProduct[];
    setSupaProducts(prods);
    setCategories((catsRes.data ?? []) as ProductCategory[]);

    // Auto-match by name
    const autoLinks: ProductLink[] = shipment.products.map(sp => {
      const match = prods.find(p =>
        p.nombre.toLowerCase().includes(sp.nombre.toLowerCase()) ||
        sp.nombre.toLowerCase().includes(p.nombre.toLowerCase())
      );
      return {
        shipmentProductId: sp.id,
        productId: match?.id ?? '',
        isNew: !match,
        newProductData: !match ? {
          nombre: sp.nombre,
          codigo: '',
          cuenta_inventario_id: '',
          especificacion: sp.especificacion ?? '',
          condicion: sp.condicion ?? 'nuevo',
          category_id: '',
          tipo_inventario: 'electronica',
        } : undefined,
      };
    });
    setLinks(autoLinks);

    // Init memos
    const s = shipment;
    setMemos([
      `${s.numero} — Capitalización flete aéreo a Inventario en Tránsito`,
      `${s.numero} — Capitalización Gravamen Arancelario`,
      `${s.numero} — Capitalización gastos de aduana (manipuleo)`,
      `${s.numero} — Nacionalización: Inventario en Tránsito → Inventario`,
    ]);
  }

  function updateLink(spId: string, patch: Partial<ProductLink>) {
    setLinks(prev => prev.map(l => l.shipmentProductId === spId ? { ...l, ...patch } : l));
  }

  function handleSelectProduct(spId: string, value: string) {
    if (value === '__new__') {
      const sp = shipment.products.find(p => p.id === spId);
      updateLink(spId, {
        productId: '',
        isNew: true,
        newProductData: { nombre: sp?.nombre ?? '', codigo: '', cuenta_inventario_id: '' },
      });
    } else {
      updateLink(spId, { productId: value, isNew: false, newProductData: undefined });
    }
  }

  async function handleGenerateSku(spId: string) {
    const link = links.find(l => l.shipmentProductId === spId);
    if (!link?.newProductData) return;
    const { tipo_inventario, category_id, condicion } = link.newProductData;
    if (!category_id) { toast.error('Selecciona una categoría primero'); return; }
    const cat = categories.find(c => c.id === category_id);
    if (!cat) return;
    setGeneratingSku(spId);
    try {
      const seq = await fetchNextSkuSequence(activeCompanyId);
      updateLink(spId, {
        newProductData: { ...link.newProductData, codigo: buildSku(tipo_inventario ?? 'electronica', cat.codigo, condicion ?? 'nuevo', seq) },
      });
    } finally {
      setGeneratingSku(null);
    }
  }

  function canAdvance(): boolean {
    return links.every(l => {
      if (!l.isNew) return !!l.productId;
      const d = l.newProductData;
      return !!(d && d.nombre.trim() && d.codigo.trim() && d.cuenta_inventario_id);
    });
  }

  function handleNext() {
    if (!canAdvance()) {
      toast.error('Completa todos los campos de vinculación antes de continuar');
      return;
    }
    setTab('preview');
  }

  // Build journal previews
  const journalPreviews = useMemo((): JournalPreview[] => {
    const s = shipment;
    const previews: JournalPreview[] = [];

    // Entry 1 — Flete
    if (s.flete_total_bs && s.flete_total_bs > 0) {
      previews.push({
        memo: memos[0] ?? '',
        lines: [
          { account_id: 'A.4.1', debit: s.flete_total_bs, credit: 0, line_memo: 'Flete aéreo capitalizado' },
          { account_id: 'G.2', debit: 0, credit: s.flete_total_bs },
        ],
      });
    }

    // Entry 2 — GA
    const totalGA = round2(s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0));
    if (totalGA > 0) {
      previews.push({
        memo: memos[1] ?? '',
        lines: [
          { account_id: 'A.4.1', debit: totalGA, credit: 0, line_memo: 'GA capitalizado' },
          { account_id: 'G.6', debit: 0, credit: totalGA },
        ],
      });
    }

    // Entry 3 — Manipuleo
    const totalManipuleo = round2(s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0));
    if (totalManipuleo > 0) {
      previews.push({
        memo: memos[2] ?? '',
        lines: [
          { account_id: 'A.4.1', debit: totalManipuleo, credit: 0, line_memo: 'Manipuleo capitalizado' },
          { account_id: 'G.5', debit: 0, credit: totalManipuleo },
        ],
      });
    }

    // Entry 4 — Nacionalización (dynamic by cuenta_inventario_id)
    const byAccount: Record<string, number> = {};
    costos.forEach(({ product, costo_unitario }) => {
      const link = links.find(l => l.shipmentProductId === product.id);
      let cuentaId = '';
      if (link) {
        if (link.isNew && link.newProductData) {
          cuentaId = link.newProductData.cuenta_inventario_id;
        } else {
          const sp = supaProducts.find(p => p.id === link.productId);
          cuentaId = sp?.cuenta_inventario_id ?? '';
        }
      }
      if (!cuentaId) cuentaId = 'A.4.2'; // fallback
      byAccount[cuentaId] = round2((byAccount[cuentaId] ?? 0) + costo_unitario * product.cantidad);
    });
    const totalCosto = round2(Object.values(byAccount).reduce((a, b) => a + b, 0));

    if (totalCosto > 0) {
      const nationLines = [
        ...Object.entries(byAccount).map(([acct, monto]) => ({
          account_id: acct,
          debit: monto,
          credit: 0,
          line_memo: accounts.find(a => a.id === acct)?.name ?? acct,
        })),
        { account_id: 'A.4.1', debit: 0, credit: totalCosto, line_memo: 'Cierre Inventario en Tránsito' },
      ];
      previews.push({
        memo: memos[3] ?? '',
        lines: nationLines,
      });
    }

    return previews;
  }, [shipment, costos, links, supaProducts, memos, accounts]);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(links, memos);
    } catch (e: any) {
      toast.error(e.message || 'Error al cerrar');
    } finally {
      setLoading(false);
    }
  }

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name ?? id;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Cerrar Embarque — {shipment.numero}
          </DialogTitle>
        </DialogHeader>

        {tab === 'link' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">Paso 1: Vincular productos del embarque con el inventario</p>
              <p className="text-xs mt-0.5">Selecciona un producto existente o crea uno nuevo para cada ítem del embarque.</p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto (embarque)</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Costo Unit.</TableHead>
                  <TableHead>Vincular con</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipment.products.map(sp => {
                  const link = links.find(l => l.shipmentProductId === sp.id);
                  const costo = costos.find(c => c.product.id === sp.id);
                  return (
                    <React.Fragment key={sp.id}>
                      <TableRow>
                        <TableCell className="font-medium text-sm">
                          {sp.nombre}
                          {sp.tiene_bateria && <Badge variant="outline" className="ml-1 text-[10px]">🔋</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{sp.cantidad}</TableCell>
                        <TableCell className="text-right font-medium">{costo ? fmt(costo.costo_unitario) : '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={link?.isNew ? '__new__' : (link?.productId ?? '')}
                            onValueChange={v => handleSelectProduct(sp.id, v)}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="Seleccionar producto..." />
                            </SelectTrigger>
                            <SelectContent>
                              {supaProducts.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  <div className="flex items-center gap-1.5">
                                    <LinkIcon className="w-3 h-3 text-muted-foreground" />
                                    {p.codigo} — {p.nombre}
                                  </div>
                                </SelectItem>
                              ))}
                              <SelectItem value="__new__">
                                <div className="flex items-center gap-1.5 text-primary">
                                  <Plus className="w-3 h-3" />
                                  ➕ Crear producto nuevo
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                      {/* Inline new product fields */}
                      {link?.isNew && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={4}>
                            <div className="grid grid-cols-3 gap-3 py-1">
                              {/* Nombre */}
                              <div>
                                <Label className="text-xs">Nombre</Label>
                                <Input className="h-8" value={link.newProductData?.nombre ?? ''}
                                  onChange={e => updateLink(sp.id, { newProductData: { ...link.newProductData!, nombre: e.target.value } })} />
                              </div>
                              {/* Especificación */}
                              <div>
                                <Label className="text-xs">Especificación</Label>
                                <Input className="h-8" placeholder="256GB / Rojo / Bat 87%"
                                  value={link.newProductData?.especificacion ?? ''}
                                  onChange={e => updateLink(sp.id, { newProductData: { ...link.newProductData!, especificacion: e.target.value } })} />
                              </div>
                              {/* Condición */}
                              <div>
                                <Label className="text-xs">Condición</Label>
                                <Select
                                  value={link.newProductData?.condicion ?? 'nuevo'}
                                  onValueChange={v => updateLink(sp.id, { newProductData: { ...link.newProductData!, condicion: v } })}
                                >
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {CONDICION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* Tipo de inventario */}
                              <div>
                                <Label className="text-xs">Tipo inventario</Label>
                                <Select
                                  value={link.newProductData?.tipo_inventario ?? 'electronica'}
                                  onValueChange={v => updateLink(sp.id, { newProductData: { ...link.newProductData!, tipo_inventario: v } })}
                                >
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {TIPO_INVENTARIO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* Categoría */}
                              <div>
                                <Label className="text-xs">Categoría</Label>
                                <Select
                                  value={link.newProductData?.category_id ?? ''}
                                  onValueChange={v => updateLink(sp.id, { newProductData: { ...link.newProductData!, category_id: v } })}
                                >
                                  <SelectTrigger className="h-8"><SelectValue placeholder={categories.length ? 'Categoría...' : 'Sin categorías'} /></SelectTrigger>
                                  <SelectContent>
                                    {categories.map(c => (
                                      <SelectItem key={c.id} value={c.id}>
                                        <span className="font-mono text-xs text-muted-foreground mr-1">{c.codigo}</span>{c.nombre}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* SKU con generador */}
                              <div>
                                <Label className="text-xs">Código SKU *</Label>
                                <div className="flex gap-1">
                                  <Input className="h-8 font-mono" placeholder="ELE-CEL-NVO-0001"
                                    value={link.newProductData?.codigo ?? ''}
                                    onChange={e => updateLink(sp.id, { newProductData: { ...link.newProductData!, codigo: e.target.value } })} />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    disabled={generatingSku === sp.id}
                                    onClick={() => handleGenerateSku(sp.id)}
                                    title="Generar SKU"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${generatingSku === sp.id ? 'animate-spin' : ''}`} />
                                  </Button>
                                </div>
                              </div>
                              {/* Cuenta contable */}
                              <div className="col-span-3">
                                <Label className="text-xs">Cuenta Inventario (ACTIVO) *</Label>
                                <Select
                                  value={link.newProductData?.cuenta_inventario_id ?? ''}
                                  onValueChange={v => updateLink(sp.id, { newProductData: { ...link.newProductData!, cuenta_inventario_id: v } })}
                                >
                                  <SelectTrigger className="h-8"><SelectValue placeholder="Cuenta..." /></SelectTrigger>
                                  <SelectContent>
                                    {activoAccounts.map(a => (
                                      <SelectItem key={a.id} value={a.id}>{a.id} — {a.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button onClick={handleNext} disabled={!canAdvance()}>
                Siguiente <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-800 dark:text-green-200">
              <p className="font-medium">Paso 2: Previsualización de asientos contables</p>
              <p className="text-xs mt-0.5">Revisa y edita los memos antes de confirmar. Se generarán {journalPreviews.length} asiento(s).</p>
            </div>

            <div className="space-y-4">
              {journalPreviews.map((jp, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Asiento {idx + 1}</Badge>
                  </div>
                  <div>
                    <Label className="text-xs">Memo</Label>
                    <Input
                      value={jp.memo}
                      onChange={e => {
                        const newMemos = [...memos];
                        // Map preview index back to memo index
                        const memoIdx = getMemoIndex(idx);
                        newMemos[memoIdx] = e.target.value;
                        setMemos(newMemos);
                      }}
                      className="h-8"
                    />
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead className="text-right">Debe</TableHead>
                        <TableHead className="text-right">Haber</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jp.lines.map((line, li) => (
                        <TableRow key={li}>
                          <TableCell className="text-sm">
                            <span className="font-mono text-xs text-muted-foreground mr-1">{line.account_id}</span>
                            {getAccountName(line.account_id)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {line.debit > 0 ? fmt(line.debit) : ''}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {line.credit > 0 ? fmt(line.credit) : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setTab('link')}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Volver
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleConfirm}
                disabled={loading}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                {loading ? 'Cerrando...' : 'Aprobar y Cerrar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // Map preview entry index to the original memo index (0-3)
  function getMemoIndex(previewIdx: number): number {
    const s = shipment;
    let memoIdx = 0;
    let currentPreview = 0;

    // Entry 1 — Flete
    if (s.flete_total_bs && s.flete_total_bs > 0) {
      if (currentPreview === previewIdx) return 0;
      currentPreview++;
    }
    // Entry 2 — GA
    const totalGA = s.products.reduce((sum, p) => sum + (p.ga_monto ?? 0), 0);
    if (totalGA > 0) {
      if (currentPreview === previewIdx) return 1;
      currentPreview++;
    }
    // Entry 3 — Manipuleo
    const totalManipuleo = s.gastos_aduana.reduce((sum, g) => sum + g.monto, 0);
    if (totalManipuleo > 0) {
      if (currentPreview === previewIdx) return 2;
      currentPreview++;
    }
    // Entry 4 — Nacionalización
    if (currentPreview === previewIdx) return 3;
    return previewIdx;
  }
}
