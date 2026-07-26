// src/components/catalogo/CatalogNoticias.tsx
// Barra de "últimos sucesos" del catálogo: novedades cortas que se deslizan solas
// (cambios de precio, tus ventas, últimas unidades). Cada aviso se puede ocultar
// con el ojo y no vuelve a aparecer (se recuerda en el navegador).
//
// No consulta tablas directamente: usa las mismas RPC seguras que el resto del
// catálogo (get_catalog_productos / get_catalog_stock / get_my_ventas), así que
// un vendedor nunca ve costo, margen ni ventas de otros vendedores.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EyeOff, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, PackageCheck, PackageX, ShoppingCart, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/accounting/utils';

// Ventana "momentánea": solo sucesos recientes.
const DIAS_VISIBLES     = 7;
const MAX_NOTICIAS      = 8;
const ROTACION_MS       = 6000;   // escritorio
const ROTACION_MS_MOVIL = 11000;  // celular: texto a 2 líneas, más tiempo para leer

type NoticiaTipo = 'precio_sube' | 'precio_baja' | 'venta' | 'venta_propia' | 'agotado' | 'fotos';

interface Noticia {
  id: string;            // estable: si el suceso se repite con otra fecha, es un aviso nuevo
  tipo: NoticiaTipo;
  texto: string;
  descripcion?: string;  // variante/especificación del producto (color, almacenamiento…)
  detalle?: string;
  fecha: number;         // epoch ms, para ordenar
}

// ─── Persistencia de "ya no me lo muestres" ───────────────────────────────────

function storageKey(companyId: string | null) {
  return `catalogo-noticias-ocultas:${companyId ?? 'sin-empresa'}`;
}

function leerOcultas(companyId: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function guardarOcultas(companyId: string | null, ids: Set<string>) {
  try {
    // Solo guardamos las últimas 200 para que no crezca sin control.
    localStorage.setItem(storageKey(companyId), JSON.stringify([...ids].slice(-200)));
  } catch {
    /* sin espacio o modo privado: el aviso simplemente reaparecerá */
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haceCuanto(epochMs: number): string {
  const min = Math.floor((Date.now() - epochMs) / 60000);
  if (min < 1)  return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

const ESTILO: Record<NoticiaTipo, { icon: React.ElementType; color: string }> = {
  precio_sube:  { icon: ArrowUp,      color: 'text-emerald-600 dark:text-emerald-400' },
  precio_baja:  { icon: ArrowDown,    color: 'text-red-600 dark:text-red-400' },
  venta:        { icon: ShoppingCart, color: 'text-violet-600 dark:text-violet-400' },
  venta_propia: { icon: PackageCheck, color: 'text-blue-600 dark:text-blue-400' },
  agotado:      { icon: PackageX,     color: 'text-red-600 dark:text-red-400' },
  fotos:        { icon: Camera,       color: 'text-fuchsia-600 dark:text-fuchsia-400' },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function CatalogNoticias() {
  const companyId = useActiveCompanyId();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [ocultas, setOcultas]   = useState<Set<string>>(() => leerOcultas(companyId));
  const [idx, setIdx]           = useState(0);
  const [pausado, setPausado]   = useState(false);
  const [esMovil, setEsMovil]   = useState(false);

  // Detectar pantalla chica (celular) para rotar más lento.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const actualizar = () => setEsMovil(mq.matches);
    actualizar();
    mq.addEventListener('change', actualizar);
    return () => mq.removeEventListener('change', actualizar);
  }, []);

  // Al cambiar de empresa, recargar qué avisos estaban ocultos.
  useEffect(() => { setOcultas(leerOcultas(companyId)); }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let activo = true;
    (async () => {
      const desde = Date.now() - DIAS_VISIBLES * 24 * 60 * 60 * 1000;
      const [prodRes, stockRes, ventasRes, ventasEmpresaRes, fotosRes] = await Promise.allSettled([
        supabase.rpc('get_catalog_productos', { p_company_id: companyId }),
        supabase.rpc('get_catalog_stock',     { p_company_id: companyId }),
        supabase.rpc('get_my_ventas',         { p_company_id: companyId }),
        supabase.rpc('get_catalog_ventas_recientes', { p_company_id: companyId, p_dias: DIAS_VISIBLES }),
        supabase.rpc('get_catalog_fotos_recientes',  { p_company_id: companyId, p_dias: DIAS_VISIBLES }),
      ]);

      const items: Noticia[] = [];

      // 1) Cambios de precio (el trigger de la BD guarda precio anterior + fecha)
      if (prodRes.status === 'fulfilled' && !prodRes.value.error) {
        const productos = (prodRes.value.data ?? []) as Array<{
          id: string; nombre: string; especificacion: string | null;
          precio_lista: number | null;
          precio_lista_anterior: number | null;
          precio_actualizado_at: string | null;
        }>;
        for (const p of productos) {
          if (!p.precio_actualizado_at || p.precio_lista == null || p.precio_lista_anterior == null) continue;
          const t = new Date(p.precio_actualizado_at).getTime();
          if (!isFinite(t) || t < desde) continue;
          const subio = p.precio_lista > p.precio_lista_anterior;
          if (p.precio_lista === p.precio_lista_anterior) continue;
          items.push({
            id: `precio:${p.id}:${p.precio_actualizado_at}`,
            tipo: subio ? 'precio_sube' : 'precio_baja',
            texto: `${p.nombre} ${subio ? 'subió' : 'bajó'} a Bs ${fmt(p.precio_lista)}`,
            descripcion: p.especificacion || undefined,
            detalle: `antes Bs ${fmt(p.precio_lista_anterior)}`,
            fecha: t,
          });
        }
      }

      // 2) Tus ventas recientes (get_my_ventas ya filtra por el vendedor logueado).
      //    Guardamos "fecha|producto" para no repetir después el aviso general:
      //    si la venta fue tuya, ya te enteraste.
      const misVentas = new Set<string>();
      if (ventasRes.status === 'fulfilled' && !ventasRes.value.error) {
        const ventas = (ventasRes.value.data ?? []) as Array<{
          fecha: string; numero: string; productos: string; comision: number;
        }>;
        for (const v of ventas) {
          const t = new Date(v.fecha).getTime();
          if (!isFinite(t) || t < desde) continue;
          // `productos` viene como "Nombre x2, Otro x1" → extraemos los nombres.
          for (const parte of v.productos.split(', ')) {
            misVentas.add(`${v.fecha}|${parte.replace(/ x[\d.]+$/, '')}`);
          }
          items.push({
            id: `venta-propia:${v.numero}`,
            tipo: 'venta_propia',
            texto: `Vendiste ${v.productos}`,
            detalle: v.comision > 0 ? `comisión Bs ${fmt(v.comision)}` : undefined,
            fecha: t,
          });
        }
      }

      // Stock actual por producto — se usa para enriquecer los avisos de venta.
      const stockPorProducto = new Map<string, number>(
        stockRes.status === 'fulfilled' && !stockRes.value.error
          ? ((stockRes.value.data ?? []) as Array<{ product_id: string; stock_disponible: number }>)
              .map(s => [s.product_id, Number(s.stock_disponible)])
          : []
      );

      // 3) Ventas de TODA la empresa: el aviso clave para dejar de promocionar
      //    algo que ya salió. Si además quedó en cero, se marca como agotado.
      if (ventasEmpresaRes.status === 'fulfilled' && !ventasEmpresaRes.value.error) {
        const ventas = (ventasEmpresaRes.value.data ?? []) as Array<{
          product_id: string; nombre: string; especificacion: string | null; cantidad: number; fecha: string;
        }>;
        for (const v of ventas) {
          const t = new Date(v.fecha).getTime();
          if (!isFinite(t) || t < desde) continue;
          const restante = stockPorProducto.get(v.product_id);
          const agotado  = restante != null && restante <= 0;
          // Si la venta fue tuya y todavía queda stock, ya lo dice tu propio aviso.
          // Cuando se agotó sí lo mostramos: es información que nadie debe perderse.
          if (!agotado && misVentas.has(`${v.fecha}|${v.nombre}`)) continue;
          const uds      = Number(v.cantidad);
          items.push({
            id: `venta:${v.product_id}:${v.fecha}`,
            tipo: agotado ? 'agotado' : 'venta',
            texto: agotado
              ? `${v.nombre} se agotó — ya no lo promociones`
              : `Se vendi${uds === 1 ? 'ó' : 'eron'} ${uds} ${v.nombre}`,
            descripcion: v.especificacion || undefined,
            detalle: agotado
              ? undefined
              : restante != null ? `quedan ${restante}` : undefined,
            fecha: t,
          });
        }
      }

      // 4) Nuevas sesiones de fotos — material fresco para promocionar.
      if (fotosRes.status === 'fulfilled' && !fotosRes.value.error) {
        const sesiones = (fotosRes.value.data ?? []) as Array<{
          product_id: string; nombre: string; especificacion: string | null;
          sesion_nombre: string | null; fotos: number; fecha: string;
        }>;
        for (const s of sesiones) {
          const t = new Date(s.fecha).getTime();
          if (!isFinite(t) || t < desde) continue;
          const n = Number(s.fotos);
          items.push({
            id: `fotos:${s.product_id}:${s.fecha}`,
            tipo: 'fotos',
            texto: `Nuevas fotos de ${s.nombre}`,
            descripcion: s.especificacion || undefined,
            detalle: [s.sesion_nombre?.trim() || null, `${n} foto${n === 1 ? '' : 's'}`]
              .filter(Boolean).join(' · '),
            fecha: t,
          });
        }
      }

      if (!activo) return;
      // "Agotado" primero (es lo que evita seguir promocionando algo que no está),
      // el resto por fecha descendente.
      const prioridad = (n: Noticia) => (n.tipo === 'agotado' ? 0 : 1);
      items.sort((a, b) => prioridad(a) - prioridad(b) || b.fecha - a.fecha);
      setNoticias(items.slice(0, MAX_NOTICIAS));
    })();
    return () => { activo = false; };
  }, [companyId]);

  const visibles = useMemo(
    () => noticias.filter(n => !ocultas.has(n.id)),
    [noticias, ocultas],
  );

  // Mantener el índice dentro de rango cuando cambia la lista.
  useEffect(() => {
    if (idx >= visibles.length) setIdx(0);
  }, [visibles.length, idx]);

  // Rotación automática (se pausa al pasar el mouse).
  useEffect(() => {
    if (pausado || visibles.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % visibles.length), ROTACION_MS);
    return () => clearInterval(t);
  }, [pausado, visibles.length]);

  const ocultar = useCallback((id: string) => {
    setOcultas(prev => {
      const next = new Set(prev).add(id);
      guardarOcultas(companyId, next);
      return next;
    });
  }, [companyId]);

  if (visibles.length === 0) return null;

  const actual = visibles[Math.min(idx, visibles.length - 1)];
  const { icon: Icon, color } = ESTILO[actual.tipo];

  return (
    <TooltipProvider>
      <div
        className="flex items-center gap-2 sm:gap-3 rounded-lg border bg-muted/40 px-3 sm:px-4 py-3 min-h-[3.5rem] overflow-hidden shadow-sm"
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
      >
        <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          Novedades
        </span>

        {/* El `key` fuerza el remount en cada cambio → se re-dispara la animación */}
        <div key={actual.id} className="flex-1 min-w-0 flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${color}`} />
          <div className="min-w-0">
            {/* Título del suceso */}
            <p className="text-sm font-semibold leading-snug line-clamp-2 sm:truncate">
              {actual.texto}
            </p>
            {/* Descripción abajo: variante del producto + detalle + cuándo */}
            <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2 sm:truncate">
              {[actual.descripcion, actual.detalle, haceCuanto(actual.fecha)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {visibles.length > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
              aria-label="Anterior"
              onClick={() => setIdx(i => (i - 1 + visibles.length) % visibles.length)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums px-0.5">
              {Math.min(idx, visibles.length - 1) + 1}/{visibles.length}
            </span>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
              aria-label="Siguiente"
              onClick={() => setIdx(i => (i + 1) % visibles.length)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Ocultar este aviso"
              onClick={() => ocultar(actual.id)}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>No mostrar más este aviso</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
