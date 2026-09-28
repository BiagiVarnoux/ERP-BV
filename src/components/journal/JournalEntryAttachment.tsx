// src/components/journal/JournalEntryAttachment.tsx
// Marca en el Libro Diario que un asiento tiene su factura guardada en el libro
// fiscal, con accesos para verla o descargarla.
//
// El archivo vive en el módulo de Impuestos (`tax_documents.archivo_path`) y se
// enlaza al asiento por `journal_entry_id`. Aquí solo se muestra y se abre: el
// alta la hace el pop-up fiscal al guardar el asiento.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Eye, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadBlob, openExternalUrl } from '@/lib/open-url';
import {
  descargarArchivoFactura, urlFirmadaFactura, type ArchivoDeAsiento,
} from '@/domain/taxes';

interface Props {
  archivo: ArchivoDeAsiento;
  /** `compact` = solo iconos, para la fila de la tabla en escritorio. */
  variant?: 'compact' | 'full';
  className?: string;
}

export function JournalEntryAttachment({ archivo, variant = 'compact', className }: Props) {
  const [abriendo, setAbriendo] = useState(false);
  const [bajando, setBajando] = useState(false);

  // Una DIM se nombra por su N° de declaración (DI-AAAA-...), no como factura:
  // su `numero_factura` es '0' por convención del Libro de Compras.
  const esDim = archivo.tipo_documento === 'dui';
  const claseDoc = esDim
    ? 'DIM'
    : archivo.tipo === 'compra' ? 'Factura de compra' : 'Factura de venta';
  /** Lo que se ve en el Diario: qué clase de documento hay, sin su número. */
  const etiqueta = `${claseDoc} adjunta`;
  /** Detalle completo, solo para el tooltip y las etiquetas de accesibilidad. */
  const detalle = archivo.referencia ? `${claseDoc} ${archivo.referencia}` : etiqueta;

  // El bucket es privado: para ver el archivo hace falta una URL firmada temporal.
  async function ver() {
    setAbriendo(true);
    try {
      openExternalUrl(await urlFirmadaFactura(archivo.archivo_path));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el archivo');
    } finally {
      setAbriendo(false);
    }
  }

  async function descargar() {
    setBajando(true);
    try {
      const blob = await descargarArchivoFactura(archivo.archivo_path);
      downloadBlob(blob, archivo.archivo_nombre ?? `factura-${archivo.referencia ?? 'documento'}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el archivo');
    } finally {
      setBajando(false);
    }
  }

  if (variant === 'full') {
    return (
      <div className={cn('flex items-center gap-2 min-w-0', className)}>
        <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate flex-1" title={detalle}>
          {etiqueta}
        </span>
        <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={ver} disabled={abriendo}>
          {abriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="ml-1.5 text-xs">Ver</span>
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={descargar} disabled={bajando}>
          {bajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </Button>
      </div>
    );
  }

  return (
    <span className={cn('inline-flex items-center', className)} title={detalle}>
      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
      <Button
        size="icon" variant="ghost" className="h-6 w-6"
        title={`Ver ${detalle}`} aria-label={`Ver ${detalle}`}
        onClick={ver} disabled={abriendo}
      >
        {abriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      </Button>
      <Button
        size="icon" variant="ghost" className="h-6 w-6"
        title={`Descargar ${detalle}`} aria-label={`Descargar ${detalle}`}
        onClick={descargar} disabled={bajando}
      >
        {bajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </Button>
    </span>
  );
}
