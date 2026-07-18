// src/components/catalogo/CatalogManageView.tsx
// Vista de gestión del Catálogo de Ventas (solo owner/edit): tabla compacta
// con edición inline de precio/costo/comisión/visibilidad por producto, más
// la calculadora de ganancia neta/bruta y precio con factura (reemplaza la
// calculadora HTML que el usuario usaba antes por embarque). Escribe directo
// a `products`, sin pasar por NewProductModal.tsx — se mantiene aislado del
// formulario de Inventario.
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Images, EyeOff, Eye, Pencil } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt, round2, toDecimal } from '@/accounting/utils';
import { PhotoSessionUploader } from '@/components/catalogo/PhotoSessionUploader';

interface ProductRow {
  id: string;
  nombre: string;
  especificacion: string | null;
  precio_lista: number | null;
  precio_minimo_negociacion: number | null;
  comision_bs: number | null;
  costo_con_iva_bs: number | null;
  iva_importado_bs: number | null;
  descripcion_catalogo: string | null;
  mostrar_en_catalogo: boolean;
  oculto_en_gestion: boolean;
}

interface Draft {
  precio_lista: string;
  precio_minimo_negociacion: string;
  comision_bs: string;
  costo_con_iva_bs: string;
  iva_importado_bs: string;
  descripcion_catalogo: string;
  mostrar_en_catalogo: boolean;
}

function toDraft(p: ProductRow): Draft {
  return {
    precio_lista: p.precio_lista != null ? String(p.precio_lista) : '',
    precio_minimo_negociacion: p.precio_minimo_negociacion != null ? String(p.precio_minimo_negociacion) : '',
    comision_bs: p.comision_bs != null ? String(p.comision_bs) : '',
    costo_con_iva_bs: p.costo_con_iva_bs != null ? String(p.costo_con_iva_bs) : '',
    iva_importado_bs: p.iva_importado_bs != null ? String(p.iva_importado_bs) : '',
    descripcion_catalogo: p.descripcion_catalogo ?? '',
    mostrar_en_catalogo: p.mostrar_en_catalogo,
  };
}

/** Ganancia neta: precio sin factura menos el costo total (incluye el IVA
 *  pagado en la importación, como gasto). Ganancia bruta: precio sin factura
 *  menos el costo sin contar el IVA importado (se recupera como crédito
 *  fiscal al facturar). Precio con factura: iguala la ganancia bruta,
 *  descontando el IVA ya pagado en la importación y el 13% de débito fiscal. */
function computeGanancias(d: Draft): { gananciaNeta: number; gananciaBruta: number; precioConFactura: number } | null {
  const precio = toDecimal(d.precio_lista);
  const costo = toDecimal(d.costo_con_iva_bs);
  if (!precio || !costo) return null;
  const iva = toDecimal(d.iva_importado_bs);
  return {
    gananciaNeta: round2(precio - costo),
    gananciaBruta: round2(precio - (costo - iva)),
    precioConFactura: round2((precio - iva) / 0.84),
  };
}

export function CatalogManageView() {
  const companyId = useActiveCompanyId();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [fotosProductId, setFotosProductId] = useState<string | null>(null);
  const [detalleProductId, setDetalleProductId] = useState<string | null>(null);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [ocultando, setOcultando] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: prods, error: prodErr }, { data: stockRows, error: stockErr }] = await Promise.all([
        supabase
          .from('products')
          .select('id, nombre, especificacion, precio_lista, precio_minimo_negociacion, comision_bs, costo_con_iva_bs, iva_importado_bs, descripcion_catalogo, mostrar_en_catalogo, oculto_en_gestion')
          .eq('company_id', companyId)
          .eq('status', 'activo')
          .order('nombre'),
        supabase.rpc('get_catalog_stock', { p_company_id: companyId }),
      ]);
      if (prodErr) throw prodErr;
      if (stockErr) throw stockErr;

      const rows = (prods ?? []) as ProductRow[];
      setProducts(rows);
      setDrafts(Object.fromEntries(rows.map(p => [p.id, toDraft(p)])));
      setStock(Object.fromEntries(
        ((stockRows ?? []) as Array<{ product_id: string; stock_disponible: number }>)
          .map(r => [r.product_id, Number(r.stock_disponible)])
      ));
    } catch (e: any) {
      toast.error(e.message || 'Error cargando productos');
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(id: string, changes: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  }

  async function guardar(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase
        .from('products')
        .update({
          precio_lista: d.precio_lista !== '' ? toDecimal(d.precio_lista) : null,
          precio_minimo_negociacion: d.precio_minimo_negociacion !== '' ? toDecimal(d.precio_minimo_negociacion) : null,
          comision_bs: d.comision_bs !== '' ? toDecimal(d.comision_bs) : null,
          costo_con_iva_bs: d.costo_con_iva_bs !== '' ? toDecimal(d.costo_con_iva_bs) : null,
          iva_importado_bs: d.iva_importado_bs !== '' ? toDecimal(d.iva_importado_bs) : null,
          descripcion_catalogo: d.descripcion_catalogo.trim() || null,
          mostrar_en_catalogo: d.mostrar_en_catalogo,
        })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      toast.success('Guardado');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  async function toggleOcultar(p: ProductRow) {
    setOcultando(prev => ({ ...prev, [p.id]: true }));
    try {
      const { error } = await supabase
        .from('products')
        .update({ oculto_en_gestion: !p.oculto_en_gestion })
        .eq('id', p.id)
        .eq('company_id', companyId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error al ocultar el producto');
    } finally {
      setOcultando(prev => ({ ...prev, [p.id]: false }));
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  const visibles = products.filter(p => {
    if (mostrarOcultos) return true;
    const stockDisponible = stock[p.id] ?? 0;
    return !p.oculto_en_gestion && stockDisponible > 0;
  });
  const ocultosCount = products.length - visibles.length;
  const detalleProduct = products.find(p => p.id === detalleProductId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {visibles.length} producto(s) {mostrarOcultos ? '' : `— ${ocultosCount} sin stock u ocultos no se muestran`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setMostrarOcultos(v => !v)}>
          {mostrarOcultos ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {mostrarOcultos ? 'Ocultar sin stock/ocultos' : `Mostrar todos (${ocultosCount} ocultos)`}
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Producto</TableHead>
              <TableHead className="w-24">Precio lista</TableHead>
              <TableHead className="w-24">Costo c/IVA</TableHead>
              <TableHead className="w-24">IVA import.</TableHead>
              <TableHead className="w-28">Ganancia neta/bruta</TableHead>
              <TableHead className="w-24">Precio c/factura</TableHead>
              <TableHead className="w-24">Precio mín.</TableHead>
              <TableHead className="w-20">Comisión</TableHead>
              <TableHead className="w-16 text-center">Catálogo</TableHead>
              <TableHead className="w-40"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map(p => {
              const d = drafts[p.id];
              if (!d) return null;
              const stockDisponible = stock[p.id] ?? 0;
              const ganancias = computeGanancias(d);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-sm leading-tight">{p.nombre}</div>
                    {p.especificacion && <div className="text-xs text-muted-foreground">{p.especificacion}</div>}
                    <div className="text-xs text-muted-foreground">
                      Stock: {fmt(stockDisponible)}
                      {stockDisponible <= 0 && ' (agotado)'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" className="h-8 w-24"
                      value={d.precio_lista}
                      onChange={e => updateDraft(p.id, { precio_lista: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" className="h-8 w-24"
                      value={d.costo_con_iva_bs}
                      onChange={e => updateDraft(p.id, { costo_con_iva_bs: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" className="h-8 w-24"
                      value={d.iva_importado_bs}
                      onChange={e => updateDraft(p.id, { iva_importado_bs: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {ganancias ? (
                      <>
                        <div>Neta: <span className="font-medium">Bs {fmt(ganancias.gananciaNeta)}</span></div>
                        <div className="text-muted-foreground">Bruta: Bs {fmt(ganancias.gananciaBruta)}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Falta precio/costo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ganancias ? `Bs ${fmt(ganancias.precioConFactura)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" className="h-8 w-24"
                      value={d.precio_minimo_negociacion}
                      onChange={e => updateDraft(p.id, { precio_minimo_negociacion: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" step="0.01" className="h-8 w-20"
                      value={d.comision_bs}
                      onChange={e => updateDraft(p.id, { comision_bs: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={d.mostrar_en_catalogo}
                      onCheckedChange={(checked) => updateDraft(p.id, { mostrar_en_catalogo: !!checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Descripción" onClick={() => setDetalleProductId(p.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Fotos" onClick={() => setFotosProductId(p.id)}>
                        <Images className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={p.oculto_en_gestion ? 'Mostrar' : 'Ocultar'} onClick={() => toggleOcultar(p)} disabled={ocultando[p.id]}>
                        {p.oculto_en_gestion ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" className="h-8" onClick={() => guardar(p.id)} disabled={saving[p.id]}>
                        {saving[p.id] ? '...' : 'Guardar'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {detalleProduct && (
        <Dialog open={!!detalleProductId} onOpenChange={(open) => !open && setDetalleProductId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Descripción — {detalleProduct.nombre}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">Descripción para el vendedor</Label>
              <Textarea
                rows={4}
                value={drafts[detalleProduct.id]?.descripcion_catalogo ?? ''}
                onChange={e => updateDraft(detalleProduct.id, { descripcion_catalogo: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetalleProductId(null)}>Cerrar</Button>
              <Button onClick={() => guardar(detalleProduct.id)} disabled={saving[detalleProduct.id]}>
                {saving[detalleProduct.id] ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {fotosProductId && (
        <PhotoSessionUploader
          isOpen={!!fotosProductId}
          onClose={() => setFotosProductId(null)}
          productId={fotosProductId}
          productNombre={products.find(p => p.id === fotosProductId)?.nombre ?? ''}
        />
      )}
    </div>
  );
}
