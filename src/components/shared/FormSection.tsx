// src/components/shared/FormSection.tsx
// Sección plegable de formulario, pensada para los cotizadores (licitaciones e
// inversión): en celular el formulario completo obligaba a deslizar muchísimo,
// así que ahora cada bloque se abre solo cuando se necesita y, cerrado, muestra
// un resumen con las cifras clave para no perder contexto.

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Props {
  title: string;
  /** Resumen mostrado a la derecha del título (visible también plegado). */
  summary?: React.ReactNode;
  /** Aclaración corta bajo el título; se oculta en pantallas chicas. */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function FormSection({ title, summary, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-background/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          // min-h-11 ≈ 44px: objetivo táctil cómodo en celular.
          className="flex w-full items-center gap-2 px-3 min-h-11 py-2 text-left hover:bg-muted/40 transition-colors rounded-lg"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {hint && (
            <span className="hidden sm:inline text-[11px] font-normal normal-case text-muted-foreground/70 truncate">
              {hint}
            </span>
          )}
          {summary != null && (
            <span className="ml-auto text-[11px] font-mono text-muted-foreground truncate max-w-[55%] text-right">
              {summary}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
