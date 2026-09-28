import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Primitivas para presentar datos tabulares de forma responsive.
 *
 * Patrón de uso en una página:
 *
 *   const isMobile = useIsMobile();
 *   return isMobile ? (
 *     <DataCards>
 *       {rows.map(r => (
 *         <DataCard key={r.id} title={r.nombre} onClick={() => abrir(r)}>
 *           <DataRow label="Fecha"  value={fmt(r.fecha)} />
 *           <DataRow label="Importe" value={fmt(r.total)} align="right" strong />
 *         </DataCard>
 *       ))}
 *     </DataCards>
 *   ) : (
 *     <TableScroll> ...tu <table> de siempre... </TableScroll>
 *   );
 *
 * La idea es NO reescribir la tabla de escritorio: en móvil se apilan tarjetas
 * legibles, y en escritorio se conserva la tabla dentro de <TableScroll>.
 */

/** Envuelve una tabla para que en pantallas chicas haga scroll horizontal con
 *  inercia y bordes redondeados, sin romper el layout de la página. */
export function TableScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('-mx-4 sm:mx-0 overflow-x-auto sm:rounded-lg sm:border', className)}>
      <div className="min-w-full inline-block align-middle px-4 sm:px-0">{children}</div>
    </div>
  );
}

/** Contenedor de la lista de tarjetas (una debajo de otra). */
export function DataCards({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('space-y-2', className)}>{children}</div>;
}

/** Una tarjeta = una fila de la tabla en móvil. */
export function DataCard({
  title,
  subtitle,
  badge,
  onClick,
  className,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const interactive = typeof onClick === 'function';
  const Wrapper: React.ElementType = interactive ? 'button' : 'div';
  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'block w-full rounded-lg border bg-card p-3 text-left shadow-sm',
        interactive && 'transition-colors hover:bg-muted/50 active:bg-muted',
        className,
      )}
    >
      {(title || badge || subtitle) && (
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <div className="font-medium leading-tight truncate">{title}</div>}
            {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}
      {children && <div className="space-y-1">{children}</div>}
    </Wrapper>
  );
}

/** Una línea etiqueta → valor dentro de una tarjeta. */
export function DataRow({
  label,
  value,
  align = 'left',
  strong = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  align?: 'left' | 'right';
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          'min-w-0 tnum',
          align === 'right' ? 'text-right' : 'text-left',
          strong ? 'font-semibold' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}
