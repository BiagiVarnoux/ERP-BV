// src/components/catalogo/CatalogManageView.tsx
// Vista de gestión del Catálogo de Ventas (solo owner/edit): edición inline de
// precio/comisión/descripción/visibilidad por producto y acceso al gestor de
// fotos. Escribe directo a `products`, sin pasar por NewProductModal.tsx —
// se mantiene aislado del formulario de Inventario.
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Images, EyeOff, Eye } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/accounting/utils';
import { toDecimal } from '@/accounting/utils';
import { PhotoSessionUploader } from '@/components/catalogo/PhotoSessionUploader';

interface ProductRow {
  id: string;
  nombre: string;
  especificacion: string | null;
  precio_lista: number | null;
  precio_minimo_negociacion: number | null;
  comision_bs: number | null;
  descripcion_catalogo: string | null;
  mostrar_en_catalogo: boolean;
  oculto_en_gestion: boolean;
}

interface Draft {
  precio_lista: string;
  precio_minimo_negociacion: string;
  comision_bs: string;
  descripcion_catalogo: string;
  mostrar_en_catalogo: boolean;
}

function toDraft(p: ProductRow): Draft {
  return {
    precio_lista: p.precio_lista != null ? String(p.precio_lista) : '',
    precio_minimo_negociacion: p.precio_minimo_negociacion != null ? String(p.precio_minimo_negociacion) : '',
    comision_bs: p.comision_bs != null ? String(p.comision_bs) : '',
    descripcion_catalogo: p.descripcion_catalogo ?? '',
    mostrar_en_catalogo: p.mostrar_en_catalogo,
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
          .select('id, nombre, especificacion, precio_lista, precio_minimo_negociacion, comision_bs, descripcion_catalogo, mostrar_en_catalogo, oculto_en_gestion')
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

      {visibles.map(p => {
        const d = drafts[p.id];
        if (!d) return null;
        const stockDisponible = stock[p.id] ?? 0;
        return (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium">{p.nombre}</p>
                  {p.especificacion && (
                    <p className="text-xs text-muted-foreground">{p.especificacion}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Stock disponible: {fmt(stockDisponible)}
                    {stockDisponible <= 0 && ' — agotado, no aparece en el catálogo del vendedor'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`mostrar-${p.id}`}
                    checked={d.mostrar_en_catalogo}
                    onCheckedChange={(checked) => updateDraft(p.id, { mostrar_en_catalogo: !!checked })}
                  />
                  <Label htmlFor={`mostrar-${p.id}`} className="text-sm cursor-pointer">Mostrar en catálogo</Label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Precio de lista (Bs)</Label>
                  <Input
                    type="number" step="0.01" value={d.precio_lista}
                    onChange={e => updateDraft(p.id, { precio_lista: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Precio mínimo de negociación (Bs)</Label>
                  <Input
                    type="number" step="0.01" value={d.precio_minimo_negociacion}
                    onChange={e => updateDraft(p.id, { precio_minimo_negociacion: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comisión fija (Bs)</Label>
                  <Input
                    type="number" step="0.01" value={d.comision_bs}
                    onChange={e => updateDraft(p.id, { comision_bs: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Descripción para el vendedor</Label>
                <Textarea
                  value={d.descripcion_catalogo}
                  onChange={e => updateDraft(p.id, { descripcion_catalogo: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFotosProductId(p.id)}>
                    <Images className="h-4 w-4 mr-2" /> Fotos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleOcultar(p)} disabled={ocultando[p.id]}>
                    {p.oculto_en_gestion ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                    {p.oculto_en_gestion ? 'Mostrar' : 'Ocultar'}
                  </Button>
                </div>
                <Button size="sm" onClick={() => guardar(p.id)} disabled={saving[p.id]}>
                  {saving[p.id] ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

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
