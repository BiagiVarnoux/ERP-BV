// src/components/ui/data-card.tsx
// Primitivos para el patrón responsive "tabla en escritorio / tarjetas apiladas en móvil".
// En cada módulo: la <Table> se envuelve en `hidden sm:block` y se agrega una lista de
// <DataCard> en `sm:hidden` que reusa los mismos datos. Así en el iPhone cada fila se ve
// como una tarjeta legible, sin scroll horizontal.
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Contenedor de una tarjeta (una "fila" en móvil). Clickable opcional. */
export function DataCard({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-3 shadow-sm',
        onClick && 'cursor-pointer active:bg-muted/50 transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Cabecera de la tarjeta: título (identificador principal) a la izquierda, slot libre a la derecha. */
export function DataCardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="font-medium leading-tight break-words">{title}</div>
        {subtitle != null && subtitle !== '' && (
          <div className="text-xs text-muted-foreground mt-0.5 break-words">{subtitle}</div>
        )}
      </div>
      {right != null && <div className="shrink-0 text-right">{right}</div>}
    </div>
  );
}

/** Fila etiqueta/valor dentro de la tarjeta. */
export function DataCardRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-words min-w-0">{children}</span>
    </div>
  );
}

/** Grilla de pares etiqueta/valor (2 columnas) para muchos campos secundarios. */
export function DataCardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm', className)}>{children}</div>;
}

/** Celda dentro de DataCardGrid: etiqueta arriba, valor abajo. */
export function DataCardField({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-words">{children}</div>
    </div>
  );
}

/** Zona de acciones al pie de la tarjeta (botones a ancho cómodo para el pulgar). */
export function DataCardActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 pt-1', className)} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

/** Lista de tarjetas: sólo visible en móvil (< sm). Envuelve las DataCard. */
export function DataCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('space-y-2 sm:hidden', className)}>{children}</div>;
}
