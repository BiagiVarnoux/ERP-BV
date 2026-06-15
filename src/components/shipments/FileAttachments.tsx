// src/components/shipments/FileAttachments.tsx
// Componente reutilizable para subir y ver archivos adjuntos en embarques

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Trash2, FileText, Image, Download, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ShipmentFile } from '@/accounting/shipment-types';
import { todayISO } from '@/accounting/utils';
import { FilePreviewModal, isPreviewable } from '@/components/shared/FilePreviewModal';

const BUCKET = 'shipment-docs';

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext ?? '')) return <Image className="w-3.5 h-3.5 shrink-0" />;
  return <FileText className="w-3.5 h-3.5 shrink-0" />;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  /** Ruta base en storage: ej. "{companyId}/{shipmentId}/productos/{productId}" */
  storagePath: string;
  files: ShipmentFile[];
  onChange: (files: ShipmentFile[]) => void;
  disabled?: boolean;
  /** Texto del botón de agregar */
  label?: string;
  /** Mostrar lista compacta (una línea) o expandida */
  compact?: boolean;
}

export function FileAttachments({ storagePath, files, onChange, disabled, label = 'Adjuntar archivo', compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null); // file id loading preview

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${Date.now()}_${safeName}`;
      const fullPath = `${storagePath}/${uniqueName}`;

      const { error } = await supabase.storage.from(BUCKET).upload(fullPath, file);
      if (error) throw error;

      const newFile: ShipmentFile = {
        id: crypto.randomUUID(),
        name: file.name,
        path: fullPath,
        size: file.size,
        uploaded_at: todayISO(),
      };
      onChange([...files, newFile]);
      toast.success(`Archivo "${file.name}" subido`);
    } catch (err: any) {
      toast.error(`Error al subir archivo: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handlePreview(f: ShipmentFile) {
    setPreviewing(f.id);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600);
      if (error) throw error;
      setPreview({ url: data.signedUrl, name: f.name });
    } catch (err: any) {
      toast.error(`Error al obtener vista previa: ${err.message}`);
    } finally {
      setPreviewing(null);
    }
  }

  async function handleDownload(f: ShipmentFile) {
    setDownloading(f.id);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(f.path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Error al descargar: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(f: ShipmentFile) {
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([f.path]);
      if (error) throw error;
      onChange(files.filter(x => x.id !== f.id));
      toast.success(`Archivo "${f.name}" eliminado`);
    } catch (err: any) {
      toast.error(`Error al eliminar: ${err.message}`);
    }
  }

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'space-y-1.5'}>
      {/* Lista de archivos */}
      {files.map(f => (
        <div
          key={f.id}
          className={
            compact
              ? 'flex items-center gap-1 text-xs bg-muted/60 border rounded px-2 py-0.5 max-w-[200px]'
              : 'flex items-center gap-2 text-xs bg-muted/40 border rounded-md px-2 py-1.5'
          }
        >
          {fileIcon(f.name)}
          <span className="truncate flex-1" title={f.name}>{f.name}</span>
          {!compact && f.size && (
            <span className="text-muted-foreground shrink-0">{formatSize(f.size)}</span>
          )}
          {isPreviewable(f.name) && (
            <button
              type="button"
              onClick={() => handlePreview(f)}
              disabled={previewing === f.id}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Ver"
            >
              {previewing === f.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Eye className="w-3 h-3" />
              }
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDownload(f)}
            disabled={downloading === f.id}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Descargar"
          >
            {downloading === f.id
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Download className="w-3 h-3" />
            }
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => handleDelete(f)}
              className="text-muted-foreground hover:text-destructive shrink-0"
              title="Eliminar"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* Botón de subir */}
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Paperclip className="w-3 h-3" />
            }
            {uploading ? 'Subiendo…' : label}
          </Button>
        </>
      )}

      {/* Visor de archivos */}
      {preview && (
        <FilePreviewModal
          open={!!preview}
          onClose={() => setPreview(null)}
          fileName={preview.name}
          url={preview.url}
          onDownload={() => {
            const f = files.find(x => x.name === preview.name);
            if (f) handleDownload(f);
          }}
        />
      )}
    </div>
  );
}
