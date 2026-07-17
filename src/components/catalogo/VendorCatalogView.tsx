// src/components/catalogo/VendorCatalogView.tsx
// Vista de solo lectura para vendedores a comisión. Nunca trae costo ni
// margen — el select a `products` está acotado a propósito, así que aunque
// un permiso se configure mal, este componente no tiene ruta para mostrarlos.
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/accounting/utils';
import { ProductFotoStorage, FotoSesion } from '@/accounting/product-foto-storage';

interface CatalogItem {
  id: string;
  nombre: string;
  especificacion: string | null;
  descripcion_catalogo: string | null;
  precio_lista: number | null;
  precio_minimo_negociacion: number | null;
  comision_bs: number | null;
}

export function VendorCatalogView() {
  const companyId = useActiveCompanyId();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: products, error: prodErr }, { data: stockRows, error: stockErr }] = await Promise.all([
        supabase
          .from('products')
          .select('id, nombre, especificacion, descripcion_catalogo, precio_lista, precio_minimo_negociacion, comision_bs')
          .eq('company_id', companyId)
          .eq('mostrar_en_catalogo', true)
          .eq('status', 'activo'),
        supabase.rpc('get_catalog_stock', { p_company_id: companyId }),
      ]);
      if (prodErr) throw prodErr;
      if (stockErr) throw stockErr;

      const stockByProduct = new Map<string, number>(
        ((stockRows ?? []) as Array<{ product_id: string; stock_disponible: number }>)
          .map(r => [r.product_id, Number(r.stock_disponible)])
      );
      const visibles = ((products ?? []) as CatalogItem[]).filter(p => (stockByProduct.get(p.id) ?? 0) > 0);
      setItems(visibles);
    } catch (e: any) {
      toast.error(e.message || 'Error cargando el catálogo');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando catálogo...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay productos disponibles en el catálogo por ahora.</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(item => <CatalogCard key={item.id} item={item} />)}
    </div>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const [sesiones, setSesiones] = useState<FotoSesion[]>([]);
  const [sesionIdx, setSesionIdx] = useState(0);
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    ProductFotoStorage.listFotos(item.id).then(setSesiones).catch(() => setSesiones([]));
  }, [item.id]);

  const sesionActual = sesiones[sesionIdx];

  // Precarga los blobs de la sesión ANTES de que el vendedor toque "Compartir".
  // iOS Safari exige que navigator.share() se llame sin demoras async después
  // del gesto del usuario — si esperamos a descargar las fotos recién al
  // hacer clic, el "user activation" ya expiró y share() falla en silencio
  // (por eso salía "no se pudo compartir las fotos").
  useEffect(() => {
    let cancelado = false;
    setFotoFiles([]);
    setFotoUrls([]);
    if (!sesionActual) return;
    setPreparando(true);
    (async () => {
      const urls = await Promise.all(sesionActual.fotos.map(f => ProductFotoStorage.getFotoUrl(f.path)));
      if (cancelado) return;
      setFotoUrls(urls);
      const files = await Promise.all(
        sesionActual.fotos.map(async (f, i) => {
          const res = await fetch(urls[i]);
          const blob = await res.blob();
          return new File([blob], f.nombre, { type: blob.type || 'image/jpeg' });
        })
      );
      if (!cancelado) setFotoFiles(files);
    })().finally(() => { if (!cancelado) setPreparando(false); });
    return () => { cancelado = true; };
  }, [sesionActual]);

  async function compartir() {
    if (!sesionActual || fotoFiles.length === 0) return;
    setSharing(true);
    try {
      const shareData = { files: fotoFiles, title: `${item.nombre} — ${sesionActual.sesion_nombre || 'Fotos'}` };
      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        toast.info('Tu navegador no soporta compartir varias fotos a la vez — se abrirán en pestañas nuevas.');
        fotoUrls.forEach(url => window.open(url, '_blank'));
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('[compartir]', e);
        toast.error(e?.message ? `No se pudo compartir: ${e.message}` : 'No se pudo compartir las fotos');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {sesiones.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {sesiones.map((s, i) => (
              <Badge
                key={s.sesion_id}
                variant={i === sesionIdx ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSesionIdx(i)}
              >
                {s.sesion_nombre || `Sesión ${i + 1}`}
              </Badge>
            ))}
          </div>
        )}

        <div>
          <p className="font-semibold">{item.nombre}</p>
          {item.especificacion && <p className="text-xs text-muted-foreground">{item.especificacion}</p>}
          {item.descripcion_catalogo && <p className="text-sm text-muted-foreground">{item.descripcion_catalogo}</p>}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio</span>
            <span className="font-semibold">Bs {fmt(item.precio_lista ?? 0)}</span>
          </div>
          {item.precio_minimo_negociacion != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Puedes negociar hasta</span>
              <span>Bs {fmt(item.precio_minimo_negociacion)}</span>
            </div>
          )}
          {item.comision_bs != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tu comisión</span>
              <span className="font-semibold text-green-600">Bs {fmt(item.comision_bs)}</span>
            </div>
          )}
        </div>

        {sesionActual && sesionActual.fotos.length > 0 && (
          <Button className="w-full" size="sm" onClick={compartir} disabled={sharing || preparando}>
            {sharing ? 'Compartiendo...' : preparando ? 'Preparando fotos...' : 'Compartir fotos de esta sesión'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
