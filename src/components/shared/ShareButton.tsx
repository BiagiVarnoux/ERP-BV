// src/components/shared/ShareButton.tsx
// Botón "Compartir" para análisis de inversión, licitaciones y sus productos.
//
// Comparte un enlace INTERNO de la app (nunca acceso público): quien lo abre
// necesita sesión y permiso de vista sobre el módulo. Si el recurso pertenece a
// otra de sus empresas, la app cambia de empresa sola al abrirlo
// (ver useShareTarget más abajo).

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { buildShareUrl } from '@/lib/share-url';

/** Copia texto al portapapeles con respaldo para navegadores/contextos sin API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cae al respaldo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  basePath: string;
  itemId?: string;
  /** Texto del tooltip; por defecto describe qué se comparte. */
  label?: string;
  /** `icon` = solo ícono (filas de producto); `button` = ícono + texto. */
  variant?: 'icon' | 'button';
  className?: string;
}

export function ShareButton({ basePath, itemId, label, variant = 'button', className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildShareUrl(basePath, { itemId });
    const ok = await copyText(url);
    if (!ok) { toast.error('No se pudo copiar el enlace'); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Enlace copiado', {
      description: 'Quien lo abra necesita permiso al módulo para ver los datos.',
    });
  };

  const Icon = copied ? Check : Share2;
  const tooltip = label ?? (itemId ? 'Copiar enlace a este producto' : 'Copiar enlace para compartir');

  // Provider propio: el botón se usa en cabeceras que no están dentro de uno
  // (anidar providers de Radix es seguro).
  return (
    <TooltipProvider>
      <Tooltip>
      <TooltipTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground ${className}`}
            onClick={handleShare}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={`gap-2 ${className}`} onClick={handleShare}>
            <Icon className="h-3.5 w-3.5" /> {copied ? 'Copiado' : 'Compartir'}
          </Button>
        )}
      </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
