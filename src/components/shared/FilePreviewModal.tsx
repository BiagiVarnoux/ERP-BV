// src/components/shared/FilePreviewModal.tsx
// Visor de archivos inline: PDF (iframe nativo del navegador), imágenes, con fallback para otros.

import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Image, Download, Loader2 } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

function getFileType(name: string): 'pdf' | 'image' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  return 'other';
}

interface Props {
  open: boolean;
  onClose: () => void;
  fileName: string;
  /** URL firmada de Supabase Storage (válida ~1 hora) */
  url: string;
  onDownload: () => void;
  loading?: boolean;
}

export function FilePreviewModal({ open, onClose, fileName, url, onDownload, loading }: Props) {
  const type = getFileType(fileName);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Título oculto para accesibilidad (requerido por shadcn/radix) */}
        <VisuallyHidden asChild>
          <DialogTitle>{fileName}</DialogTitle>
        </VisuallyHidden>

        {/* Barra de título */}
        <div className="flex items-center gap-2.5 pl-4 pr-14 py-3 border-b shrink-0 bg-background">
          {type === 'image'
            ? <Image className="h-4 w-4 text-muted-foreground shrink-0" />
            : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm truncate flex-1" title={fileName}>{fileName}</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 h-7 text-xs"
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-hidden min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando vista previa…
            </div>
          )}

          {!loading && type === 'pdf' && (
            <iframe
              src={url}
              className="w-full h-full border-0"
              title={fileName}
            />
          )}

          {!loading && type === 'image' && (
            <div className="flex items-center justify-center h-full p-6 bg-muted/20">
              <img
                src={url}
                alt={fileName}
                className="max-w-full max-h-full object-contain rounded shadow"
              />
            </div>
          )}

          {!loading && type === 'other' && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground px-8 text-center">
              <FileText className="h-16 w-16 opacity-15" />
              <p className="font-medium">Vista previa no disponible para este tipo de archivo</p>
              <p className="text-sm">Descarga el archivo para abrirlo en tu aplicación.</p>
              <Button onClick={onDownload} className="gap-2 mt-2">
                <Download className="h-4 w-4" />
                Descargar archivo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Retorna true si el archivo tiene vista previa disponible (PDF o imagen) */
export function isPreviewable(fileName: string): boolean {
  return getFileType(fileName) !== 'other';
}
