// src/components/catalogo/VendorCatalogView.tsx
// Vista de solo lectura para vendedores a comisión. Nunca trae costo ni
// margen — usa la RPC get_catalog_productos (SECURITY DEFINER), que solo
// selecciona columnas seguras. No es un select directo a `products`: esa
// tabla tiene RLS restringido a permisos de inventario/ventas/gestión del
// catálogo, así que un vendedor con solo acceso de vista no podría leerla
// directo de todas formas (ver migración 20260718000005).
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/accounting/utils';
import { condicionLabel } from '@/accounting/product-condicion';
import { ProductFotoStorage, FotoSesion } from '@/accounting/product-foto-storage';

interface CatalogItem {
  id: string;
  nombre: string;
  especificacion: string | null;
  condicion: string | null;
  descripcion_catalogo: string | null;
  precio_lista: number | null;
  precio_minimo_negociacion: number | null;
  comision_bs: number | null;
  precio_con_factura: number | null;
  precio_lista_anterior: number | null;
  precio_actualizado_at: string | null;
}

export function VendorCatalogView() {
  const companyId = useActiveCompanyId();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [publicados, setPublicados] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: products, error: prodErr }, { data: stockRows, error: stockErr }, { data: pubRows, error: pubErr }] = await Promise.all([
        supabase.rpc('get_catalog_productos', { p_company_id: companyId }),
        supabase.rpc('get_catalog_stock', { p_company_id: companyId }),
        // RLS deja ver solo las marcas del propio vendedor (user_id = auth.uid()).
        supabase.from('product_publicaciones').select('product_id, publicado').eq('company_id', companyId),
      ]);
      if (prodErr) throw prodErr;
      if (stockErr) throw stockErr;
      if (pubErr) throw pubErr;

      const stockByProduct = new Map<string, number>(
        ((stockRows ?? []) as Array<{ product_id: string; stock_disponible: number }>)
          .map(r => [r.product_id, Number(r.stock_disponible)])
      );
      const visibles = ((products ?? []) as CatalogItem[]).filter(p => (stockByProduct.get(p.id) ?? 0) > 0);
      setItems(visibles);
      setPublicados(Object.fromEntries(
        ((pubRows ?? []) as Array<{ product_id: string; publicado: boolean }>).map(r => [r.product_id, r.publicado])
      ));
    } catch (e: any) {
      toast.error(e.message || 'Error cargando el catálogo');
    } finally {
      setLoading(false);
    }
  }

  async function togglePublicado(productId: string, nuevo: boolean) {
    setPublicados(prev => ({ ...prev, [productId]: nuevo }));  // optimista
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const { error } = await supabase
        .from('product_publicaciones')
        .upsert({ company_id: companyId, product_id: productId, user_id: user.id, publicado: nuevo, updated_at: new Date().toISOString() },
                { onConflict: 'product_id,user_id' });
      if (error) throw error;
    } catch (e: any) {
      setPublicados(prev => ({ ...prev, [productId]: !nuevo }));  // revertir
      toast.error(e.message || 'No se pudo guardar la marca');
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando catálogo...</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay productos disponibles en el catálogo por ahora.</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(item => (
        <CatalogCard
          key={item.id}
          item={item}
          publicado={!!publicados[item.id]}
          onTogglePublicado={(nuevo) => togglePublicado(item.id, nuevo)}
        />
      ))}
    </div>
  );
}

function CatalogCard({ item, publicado, onTogglePublicado }: { item: CatalogItem; publicado: boolean; onTogglePublicado: (nuevo: boolean) => void }) {
  const [sesiones, setSesiones] = useState<FotoSesion[]>([]);
  const [sesionIdx, setSesionIdx] = useState(0);
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [preparadaSesionId, setPreparadaSesionId] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    ProductFotoStorage.listFotos(item.id).then(setSesiones).catch(() => setSesiones([]));
  }, [item.id]);

  const sesionActual = sesiones[sesionIdx];
  const lista = sesionActual != null && preparadaSesionId === sesionActual.sesion_id && fotoFiles.length > 0;

  // Indicador de cambio de precio: solo si hay un precio anterior distinto y
  // el cambio es reciente (últimos 30 días) — así el aviso se desvanece solo.
  const cambioPrecio = (() => {
    if (item.precio_lista == null || item.precio_lista_anterior == null) return null;
    if (item.precio_lista_anterior === item.precio_lista) return null;
    if (item.precio_actualizado_at) {
      const dias = (Date.now() - new Date(item.precio_actualizado_at).getTime()) / 86400000;
      if (dias > 30) return null;
    }
    return { subio: item.precio_lista > item.precio_lista_anterior };
  })();

  // Al cambiar de sesión, la preparación anterior queda inválida — no se
  // descarga nada hasta que el vendedor toque "Preparar" para ESTA sesión
  // (evita bajar fotos de todas las sesiones/productos de golpe al entrar
  // al catálogo, que era lo que lo hacía lento).
  useEffect(() => {
    setFotoFiles([]);
    setFotoUrls([]);
    setPreparadaSesionId(null);
  }, [sesionActual]);

  async function prepararFotos() {
    if (!sesionActual) return;
    setPreparando(true);
    try {
      const paths = sesionActual.fotos.map(f => f.path);
      const urls = await ProductFotoStorage.getFotoUrls(paths);
      setFotoUrls(urls);
      const files = await Promise.all(
        sesionActual.fotos.map(async (f, i) => {
          const res = await fetch(urls[i]);
          const blob = await res.blob();
          return new File([blob], f.nombre, { type: blob.type || 'image/jpeg' });
        })
      );
      setFotoFiles(files);
      setPreparadaSesionId(sesionActual.sesion_id);
    } catch (e: any) {
      toast.error(e.message || 'No se pudieron preparar las fotos');
    } finally {
      setPreparando(false);
    }
  }

  // navigator.share() debe llamarse sin demoras async después del toque del
  // usuario (iOS Safari lo rechaza en silencio si no) — por eso "Compartir"
  // solo llama a share() directo, ya con las fotos preparadas de antemano
  // en "prepararFotos" (un toque previo, separado).
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

  // Descarga a disco (para computadora), empaquetada en un solo .zip. Los
  // navegadores bloquean/descartan descargas automáticas múltiples disparadas
  // en secuencia (Chrome, por ejemplo, deja pasar solo 1-2 y calla el resto)
  // — por eso antes solo bajaban 2 fotos. Un único archivo .zip evita ese
  // límite por completo, porque es una sola descarga.
  async function descargarTodas() {
    if (!sesionActual) return;
    setDescargando(true);
    try {
      const urls = await ProductFotoStorage.getFotoUrls(sesionActual.fotos.map(f => f.path));
      const zip = new JSZip();
      await Promise.all(
        sesionActual.fotos.map(async (foto, i) => {
          const res = await fetch(urls[i]);
          const blob = await res.blob();
          zip.file(foto.nombre, blob);
        })
      );
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const nombreZip = `${item.nombre}${sesionActual.sesion_nombre ? ' - ' + sesionActual.sesion_nombre : ''}.zip`;
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = nombreZip;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(zipUrl);
    } catch (e: any) {
      toast.error(e.message || 'No se pudieron descargar las fotos');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Card className={publicado ? 'border-2 border-green-500' : ''}>
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold">{item.nombre}</p>
            {item.condicion && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{condicionLabel(item.condicion)}</Badge>}
            {publicado && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600">Publicado</Badge>}
          </div>
          {item.especificacion && <p className="text-xs text-muted-foreground">{item.especificacion}</p>}
          {item.descripcion_catalogo && (
            <div className="flex items-start gap-1 mt-1">
              <p className="text-sm text-muted-foreground whitespace-pre-line flex-1">{item.descripcion_catalogo}</p>
              <button
                type="button"
                title="Copiar descripción"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(item.descripcion_catalogo ?? '');
                  toast.success('Descripción copiada');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Precio</span>
            <span className="flex items-center gap-1.5">
              {cambioPrecio && (
                <span
                  className={`flex items-center text-[11px] font-medium ${cambioPrecio.subio ? 'text-red-600' : 'text-green-600'}`}
                  title={`Antes: Bs ${fmt(item.precio_lista_anterior!)}`}
                >
                  {cambioPrecio.subio ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  <span className="line-through text-muted-foreground ml-0.5">Bs {fmt(item.precio_lista_anterior!)}</span>
                </span>
              )}
              <span className="font-semibold">Bs {fmt(item.precio_lista ?? 0)}</span>
            </span>
          </div>
          {item.precio_con_factura != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Precio con factura</span>
              <span>Bs {fmt(item.precio_con_factura)}</span>
            </div>
          )}
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
          <div className="space-y-2">
            {lista ? (
              <Button className="w-full" size="sm" onClick={compartir} disabled={sharing}>
                {sharing ? 'Compartiendo...' : 'Compartir a celular (iPhone)'}
              </Button>
            ) : (
              <Button className="w-full" size="sm" variant="outline" onClick={prepararFotos} disabled={preparando}>
                {preparando ? 'Preparando...' : 'Preparar para compartir a celular'}
              </Button>
            )}
            <Button className="w-full" size="sm" variant="outline" onClick={descargarTodas} disabled={descargando}>
              {descargando ? 'Descargando...' : 'Descargar a la computadora'}
            </Button>
          </div>
        )}

        <Button
          className={`w-full ${publicado ? 'bg-green-600 hover:bg-green-700' : ''}`}
          size="sm"
          variant={publicado ? 'default' : 'outline'}
          onClick={() => onTogglePublicado(!publicado)}
        >
          {publicado ? <><Check className="h-4 w-4 mr-1" /> Publicado — marcar como no publicado</> : 'Marcar como publicado'}
        </Button>
      </CardContent>
    </Card>
  );
}
