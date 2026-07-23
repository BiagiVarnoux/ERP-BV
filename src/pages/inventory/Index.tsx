import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Eye, Plus, Pencil, Layers, Archive, PackageX, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { condicionLabel } from '@/accounting/product-condicion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt } from '@/accounting/utils';
import { calcularEstadoProducto, InventoryMovement } from '@/components/inventory/inventory-utils';
import { ProductKardexModal } from '@/components/inventory/ProductKardexModal';
import { FifoKardexModal } from '@/components/inventory/FifoKardexModal';
import { NewProductModal, ProductData } from '@/components/inventory/NewProductModal';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ArchiveAction = 'archivado' | 'descontinuado';

export default function InventoryPage() {
  const { accounts } = useAccounting();
  const { can } = useUserAccess();
  const canCreate  = can('inventory', 'create');
  const canEdit    = can('inventory', 'edit');
  const canDelete  = can('inventory', 'delete');
  const isReadOnly = !canCreate && !canEdit && !canDelete;
  const activeCompanyId = useActiveCompanyId();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [kardexProduct, setKardexProduct] = useState<ProductData | null>(null);
  const [fifoProduct, setFifoProduct] = useState<ProductData | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductData | null>(null);

  // Archive/discontinue modal state
  const [archiveTarget, setArchiveTarget] = useState<ProductData | null>(null);
  const [archiveAction, setArchiveAction] = useState<ArchiveAction>('archivado');
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);

  // Archived section (contextual to selected account)
  const [showArchived, setShowArchived] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState<ProductData[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    setShowArchived(false);
    setArchivedProducts([]);
  }, [selectedAccountId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('No autenticado'); return; }

      const [prodsRes, movsRes] = await Promise.all([
        supabase.from('products').select('*').eq('company_id', activeCompanyId).eq('status', 'activo'),
        supabase.from('inventory_movements').select('*').eq('company_id', activeCompanyId),
      ]);

      setProducts((prodsRes.data || []) as ProductData[]);
      setMovements((movsRes.data || []) as InventoryMovement[]);
    } catch {
      toast.error('Error cargando inventario');
    } finally {
      setLoading(false);
    }
  }

  async function loadArchivedForAccount(accountId: string) {
    setLoadingArchived(true);
    try {
      const query = supabase.from('products')
        .select('*')
        .eq('company_id', activeCompanyId)
        .in('status', ['archivado', 'descontinuado'])
        .order('archived_at', { ascending: false });

      if (accountId === '__sin_cuenta__') {
        query.is('cuenta_inventario_id', null);
      } else {
        query.eq('cuenta_inventario_id', accountId);
      }

      const { data } = await query;
      setArchivedProducts((data || []) as ProductData[]);
    } catch {
      toast.error('Error cargando productos archivados');
    } finally {
      setLoadingArchived(false);
    }
  }

  function handleToggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next && selectedAccountId) {
      loadArchivedForAccount(selectedAccountId);
    }
  }

  const accountGroups = useMemo(() => {
    const groups: Record<string, ProductData[]> = {};
    for (const p of products) {
      const key = p.cuenta_inventario_id || '__sin_cuenta__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [products]);

  function getGroupValue(prods: ProductData[]): number {
    return prods.reduce((sum, p) => {
      const productMovs = movements.filter(m => m.product_id === p.id);
      const state = calcularEstadoProducto(productMovs);
      return sum + state.saldoValorado;
    }, 0);
  }

  const selectedProducts = selectedAccountId ? accountGroups[selectedAccountId] || [] : [];

  function getProductState(productId: string) {
    const productMovs = movements.filter(m => m.product_id === productId);
    return calcularEstadoProducto(productMovs);
  }

  function handleArchiveClick(product: ProductData, action: ArchiveAction) {
    setArchiveTarget(product);
    setArchiveAction(action);
    setArchiveReason('');
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const { error } = await supabase.from('products').update({
        status: archiveAction,
        archived_at: new Date().toISOString(),
        archived_reason: archiveReason.trim() || null,
      }).eq('id', archiveTarget.id).eq('company_id', activeCompanyId);
      if (error) throw error;
      const label = archiveAction === 'archivado' ? 'archivado' : 'marcado como descontinuado';
      toast.success(`Producto "${archiveTarget.nombre}" ${label}`);
      setArchiveTarget(null);
      setArchiveReason('');
      // Refresh active list; also refresh archived list if visible
      loadData();
      if (showArchived && selectedAccountId) loadArchivedForAccount(selectedAccountId);
    } catch (e: any) {
      toast.error(e.message || 'Error al archivar producto');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(product: ProductData) {
    setRestoringId(product.id);
    try {
      const { error } = await supabase.from('products').update({
        status: 'activo',
        archived_at: null,
        archived_reason: null,
      }).eq('id', product.id).eq('company_id', activeCompanyId);
      if (error) throw error;
      toast.success(`Producto "${product.nombre}" restaurado`);
      loadData();
      if (selectedAccountId) loadArchivedForAccount(selectedAccountId);
    } catch (e: any) {
      toast.error(e.message || 'Error al restaurar producto');
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Cargando inventario...</p></div>;
  }

  const archiveActionLabel = archiveAction === 'archivado' ? 'Archivar' : 'Descontinuar';
  const currentStock = archiveTarget ? getProductState(archiveTarget.id).saldo : 0;

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold">Inventario</h1>
        {canCreate && (
          <Button onClick={() => { setEditProduct(null); setShowNewProduct(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Producto
          </Button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left panel: Account groups */}
        <div className="col-span-12 md:col-span-4 space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Cuentas de Inventario</h3>
          {Object.keys(accountGroups).length === 0 && (
            <p className="text-sm text-muted-foreground">No hay productos registrados.</p>
          )}
          {Object.entries(accountGroups).map(([accountId, prods]) => {
            const account = accounts.find(a => a.id === accountId);
            const label = account ? `${account.id} — ${account.name}` : (accountId === '__sin_cuenta__' ? 'Sin cuenta asignada' : accountId);
            const totalValue = getGroupValue(prods);
            const isSelected = selectedAccountId === accountId;

            return (
              <Card
                key={accountId}
                className={`p-4 cursor-pointer transition-colors hover:bg-accent/50 ${isSelected ? 'ring-2 ring-primary bg-accent/30' : ''}`}
                onClick={() => setSelectedAccountId(accountId)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{prods.length} producto(s)</p>
                  </div>
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold mt-2">Bs {fmt(totalValue)}</p>
              </Card>
            );
          })}
        </div>

        {/* Right panel: Products table */}
        <div className="col-span-12 md:col-span-8">
          {!selectedAccountId ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-40" />
              <p>Selecciona una cuenta de inventario para ver sus productos</p>
            </div>
          ) : (
            <>
              {selectedProducts.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No hay productos activos en esta cuenta.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Condición</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">C.U. CPP</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Último Mov.</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map(p => {
                      const s = getProductState(p.id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell><Badge variant="outline" className="font-mono text-xs">{p.codigo}</Badge></TableCell>
                          <TableCell>
                            <span>{p.nombre}</span>
                            {p.especificacion && (
                              <div className="text-xs text-muted-foreground mt-0.5">{p.especificacion}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.condicion ? (
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                {condicionLabel(p.condicion)}
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">{s.saldo} {p.unidad_medida}</TableCell>
                          <TableCell className="text-right">Bs {fmt(s.costoUnitario)}</TableCell>
                          <TableCell className="text-right font-medium">Bs {fmt(s.saldoValorado)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{s.ultimaFecha || '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex items-center gap-0.5 mr-1">
                                <Button variant="ghost" size="sm" onClick={() => setKardexProduct(p)} title="Kárdex CPP">
                                  <Eye className="w-4 h-4 mr-1" /> CPP
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setFifoProduct(p)} title="Kárdex FIFO">
                                  <Layers className="w-4 h-4 mr-1" /> FIFO
                                </Button>
                              </div>
                              {(canEdit || canDelete) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setEditProduct(p); setShowNewProduct(true); }}>
                                      <Pencil className="w-4 h-4 mr-2" /> Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleArchiveClick(p, 'archivado')}>
                                      <Archive className="w-4 h-4 mr-2" /> Archivar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-orange-600 focus:text-orange-600"
                                      onClick={() => handleArchiveClick(p, 'descontinuado')}
                                    >
                                      <PackageX className="w-4 h-4 mr-2" /> Descontinuar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {/* Archivados contextuales a esta cuenta */}
              <div className="border-t mt-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleArchived}
                  className="flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Ver productos archivados
                  {showArchived ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </Button>

                {showArchived && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Archivados / Descontinuados —{' '}
                      {accounts.find(a => a.id === selectedAccountId)?.name
                        ?? (selectedAccountId === '__sin_cuenta__' ? 'Sin cuenta asignada' : selectedAccountId)}
                    </h3>
                    {loadingArchived ? (
                      <p className="text-sm text-muted-foreground">Cargando...</p>
                    ) : archivedProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No hay productos archivados en esta cuenta.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Fecha archivado</TableHead>
                            <TableHead>Razón</TableHead>
                            {canEdit && <TableHead></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {archivedProducts.map(p => (
                            <TableRow key={p.id} className="text-muted-foreground">
                              <TableCell><Badge variant="outline">{p.codigo}</Badge></TableCell>
                              <TableCell>
                                <span>{p.nombre}</span>
                                {p.especificacion && (
                                  <div className="text-xs text-muted-foreground mt-0.5">{p.especificacion}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                {p.status === 'archivado' ? (
                                  <Badge variant="secondary">Archivado</Badge>
                                ) : (
                                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300">Descontinuado</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.archived_at ? new Date(p.archived_at).toLocaleDateString('es-BO') : '—'}
                              </TableCell>
                              <TableCell className="text-xs max-w-[160px] truncate">{p.archived_reason || '—'}</TableCell>
                              {canEdit && (
                                <TableCell>
                                  {p.status === 'archivado' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={restoringId === p.id}
                                      onClick={() => handleRestore(p)}
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                      {restoringId === p.id ? 'Restaurando...' : 'Restaurar'}
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {kardexProduct && (
        <ProductKardexModal
          isOpen={!!kardexProduct}
          onClose={() => setKardexProduct(null)}
          product={kardexProduct}
          movements={movements.filter(m => m.product_id === kardexProduct.id)}
          onMovementSaved={loadData}
          isReadOnly={isReadOnly}
        />
      )}

      {fifoProduct && (
        <FifoKardexModal
          isOpen={!!fifoProduct}
          onClose={() => setFifoProduct(null)}
          product={fifoProduct}
          onSaved={loadData}
          isReadOnly={isReadOnly}
        />
      )}

      <NewProductModal
        isOpen={showNewProduct}
        onClose={() => { setShowNewProduct(false); setEditProduct(null); }}
        onSaved={loadData}
        editProduct={editProduct}
      />

      {/* Archive / Discontinue confirmation dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={v => { if (!v) { setArchiveTarget(null); setArchiveReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {archiveAction === 'archivado'
                ? <><Archive className="w-5 h-5" /> Archivar producto</>
                : <><PackageX className="w-5 h-5 text-orange-600" /> Descontinuar producto</>
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm">
              Estás a punto de {archiveAction === 'archivado' ? 'archivar' : 'marcar como descontinuado'}{' '}
              <strong>"{archiveTarget?.nombre}"</strong> ({archiveTarget?.codigo}).
              El producto desaparecerá de las vistas operativas pero su historial contable se conserva.
            </p>

            {currentStock > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <Archive className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Este producto tiene <strong>{currentStock} unidades en stock</strong>.{' '}
                  {archiveAction === 'archivado' ? 'Archivarlo' : 'Descontinuarlo'} no afecta el inventario contable,
                  pero no aparecerá en ventas ni salidas.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">Razón (opcional)</Label>
              <Input
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                placeholder="Ej: Ya no se importa este modelo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setArchiveTarget(null); setArchiveReason(''); }}>
              Cancelar
            </Button>
            <Button
              variant={archiveAction === 'descontinuado' ? 'destructive' : 'default'}
              onClick={handleArchiveConfirm}
              disabled={archiving}
              className={archiveAction === 'archivado' ? '' : 'bg-orange-600 hover:bg-orange-700'}
            >
              {archiving ? 'Guardando...' : archiveActionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
