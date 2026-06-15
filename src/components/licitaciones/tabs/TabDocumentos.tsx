// src/components/licitaciones/tabs/TabDocumentos.tsx
import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Download, FileText, FolderOpen, Sparkles, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Licitacion, LicitacionDoc, DocCategoria,
  DOC_CATEGORIA_LABELS, DOC_CATEGORIAS_ORDEN,
} from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { DbcAnalyzerDialog } from '../DbcAnalyzerDialog';
import { FilePreviewModal, isPreviewable } from '@/components/shared/FilePreviewModal';

interface Props {
  licitacion: Licitacion;
  onReload: () => Promise<void>;
  onUpdated: (l: Licitacion) => void;
}

export function TabDocumentos({ licitacion, onReload, onUpdated }: Props) {
  const [uploading, setUploading] = useState(false);
  const [selectedCategoria, setSelectedCategoria] = useState<DocCategoria>('DBC');
  const [deleteTarget, setDeleteTarget] = useState<LicitacionDoc | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dbcDialogOpen, setDbcDialogOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; doc: LicitacionDoc } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null); // doc id loading preview
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0); // cuenta entradas/salidas de drag para evitar flicker

  const byCategoria = DOC_CATEGORIAS_ORDEN.reduce<Record<string, LicitacionDoc[]>>((acc, cat) => {
    acc[cat] = licitacion.documentos.filter(d => d.categoria === cat);
    return acc;
  }, {} as Record<string, LicitacionDoc[]>);

  // ─── Upload ────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploading(true);
      const newDocs: LicitacionDoc[] = [];
      for (const file of files) {
        const doc = await LicitacionStorage.uploadDoc(licitacion.id, file, selectedCategoria);
        newDocs.push(doc);
      }
      onUpdated({ ...licitacion, documentos: [...licitacion.documentos, ...newDocs] });
      toast.success(`${files.length} archivo${files.length > 1 ? 's' : ''} subido${files.length > 1 ? 's' : ''}`);
    } catch {
      toast.error('Error al subir el archivo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [licitacion, selectedCategoria, onUpdated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(Array.from(e.target.files || []));
  };

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  };

  // ─── Delete / Download ─────────────────────────────────────────────────────

  const handleDelete = async (doc: LicitacionDoc) => {
    try {
      await LicitacionStorage.deleteDoc(doc);
      onUpdated({ ...licitacion, documentos: licitacion.documentos.filter(d => d.id !== doc.id) });
      toast.success('Documento eliminado');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handlePreview = async (doc: LicitacionDoc) => {
    const ext = doc.nombre.split('.').pop()?.toLowerCase();
    setPreviewing(doc.id);
    try {
      const url = await LicitacionStorage.getDocUrl(doc.path);
      if (ext === 'pdf') {
        // Los navegadores modernos no permiten embeber PDFs de origen externo.
        // La URL firmada de Supabase abre el PDF en el visor nativo del navegador.
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        setPreview({ url, doc });
      }
    } catch {
      toast.error('Error al obtener vista previa');
    } finally {
      setPreviewing(null);
    }
  };

  const handleDownload = async (doc: LicitacionDoc) => {
    try {
      const url = await LicitacionStorage.getDocUrl(doc.path);
      window.open(url, '_blank');
    } catch {
      toast.error('Error al abrir el archivo');
    }
  };

  const totalDocs = licitacion.documentos.length;

  return (
    <div
      className="space-y-5 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Overlay de arrastrar */}
      {isDragging && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-primary bg-primary/5 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="h-10 w-10 text-primary mb-3" />
          <p className="text-base font-semibold text-primary">Suelta los archivos aquí</p>
          <p className="text-sm text-muted-foreground mt-1">
            Se guardarán en: <span className="font-medium">{DOC_CATEGORIA_LABELS[selectedCategoria]}</span>
          </p>
        </div>
      )}

      {/* Upload toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedCategoria} onValueChange={(v) => setSelectedCategoria(v as DocCategoria)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_CATEGORIAS_ORDEN.map(c => (
              <SelectItem key={c} value={c}>{DOC_CATEGORIA_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Subiendo...' : 'Subir archivo'}
        </Button>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setDbcDialogOpen(true)}
        >
          <Sparkles className="h-4 w-4 text-primary" />
          Analizar DBC con IA
        </Button>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx"
          className="hidden"
          onChange={handleInputChange}
        />

        {totalDocs > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalDocs} documento{totalDocs !== 1 ? 's' : ''} en total
          </span>
        )}
      </div>

      {/* Zona de drop vacía o lista de carpetas */}
      {totalDocs === 0 ? (
        <DropZoneVacia
          categoria={selectedCategoria}
          onClickUpload={() => fileRef.current?.click()}
          uploading={uploading}
        />
      ) : (
        <div className="space-y-4">
          {DOC_CATEGORIAS_ORDEN.map(cat => {
            const docs = byCategoria[cat];
            if (docs.length === 0) return null;
            return (
              <CarpetaCategoria
                key={cat}
                categoria={cat}
                docs={docs}
                onPreview={handlePreview}
                previewing={previewing}
                onDownload={handleDownload}
                onDelete={setDeleteTarget}
              />
            );
          })}
        </div>
      )}

      {/* Confirm delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.nombre}» permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog IA para analizar DBC */}
      <DbcAnalyzerDialog
        open={dbcDialogOpen}
        onClose={() => setDbcDialogOpen(false)}
        licitacion={licitacion}
        onUpdated={onUpdated}
      />

      {/* Visor de archivos */}
      {preview && (
        <FilePreviewModal
          open={!!preview}
          onClose={() => setPreview(null)}
          fileName={preview.doc.nombre}
          url={preview.url}
          onDownload={() => handleDownload(preview.doc)}
        />
      )}
    </div>
  );
}

// ─── Zona de drop vacía ────────────────────────────────────────────────────────

function DropZoneVacia({ categoria, onClickUpload, uploading }: {
  categoria: DocCategoria;
  onClickUpload: () => void;
  uploading: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-muted-foreground/20 rounded-lg text-muted-foreground cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors"
      onClick={onClickUpload}
    >
      <FolderOpen className="h-10 w-10 mb-3 opacity-30" />
      <p className="font-medium">
        {uploading ? 'Subiendo...' : 'Arrastra archivos aquí o haz clic para seleccionar'}
      </p>
      <p className="text-xs mt-1">
        Se guardarán en: <span className="font-medium">{DOC_CATEGORIA_LABELS[categoria]}</span>
      </p>
      <p className="text-xs mt-2 opacity-60">PDF, imágenes, Excel, Word</p>
    </div>
  );
}

// ─── Carpeta por categoría ─────────────────────────────────────────────────────

function CarpetaCategoria({ categoria, docs, onPreview, previewing, onDownload, onDelete }: {
  categoria: DocCategoria;
  docs: LicitacionDoc[];
  onPreview: (d: LicitacionDoc) => void;
  previewing: string | null;
  onDownload: (d: LicitacionDoc) => void;
  onDelete: (d: LicitacionDoc) => void;
}) {
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{DOC_CATEGORIA_LABELS[categoria]}</span>
        <Badge variant="secondary" className="text-xs ml-auto">{docs.length}</Badge>
      </div>
      <div className="divide-y">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{doc.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(doc.size)}
                {doc.descripcion && ` · ${doc.descripcion}`}
                {' · '}
                {new Date(doc.uploaded_at).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })}
              </p>
            </div>
            {isPreviewable(doc.nombre) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onPreview(doc)}
                title="Ver archivo"
                disabled={previewing === doc.id}
              >
                {previewing === doc.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eye className="h-3.5 w-3.5" />
                }
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onDownload(doc)} title="Descargar">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(doc)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
