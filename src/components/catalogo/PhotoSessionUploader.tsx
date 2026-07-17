// src/components/catalogo/PhotoSessionUploader.tsx
// Gestor de sesiones de fotos de un producto: subir varias imágenes de una
// vez como una sesión (con nombre opcional), ver sesiones existentes,
// eliminar fotos sueltas o la sesión completa.
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { ProductFotoStorage, FotoSesion } from '@/accounting/product-foto-storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productNombre: string;
}

export function PhotoSessionUploader({ isOpen, onClose, productId, productNombre }: Props) {
  const [sesiones, setSesiones] = useState<FotoSesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sesionNombre, setSesionNombre] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [urlsBySesion, setUrlsBySesion] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productId]);

  async function load() {
    setLoading(true);
    try {
      const data = await ProductFotoStorage.listFotos(productId);
      setSesiones(data);
      const urls: Record<string, string[]> = {};
      for (const s of data) {
        urls[s.sesion_id] = await Promise.all(s.fotos.map(f => ProductFotoStorage.getFotoUrl(f.path)));
      }
      setUrlsBySesion(urls);
    } catch (e: any) {
      toast.error(e.message || 'Error cargando fotos');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (files.length === 0) { toast.error('Selecciona al menos una foto'); return; }
    setUploading(true);
    try {
      await ProductFotoStorage.uploadFotos(productId, sesionNombre.trim() || null, files);
      toast.success('Fotos subidas');
      setSesionNombre('');
      setFiles([]);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error subiendo fotos');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteSesion(sesion: FotoSesion) {
    if (!confirm(`¿Eliminar la sesión "${sesion.sesion_nombre || 'sin nombre'}" (${sesion.fotos.length} fotos)?`)) return;
    try {
      await ProductFotoStorage.deleteSesion(sesion);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error eliminando la sesión');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fotos — {productNombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-md p-3 space-y-2">
            <Label className="text-xs">Nueva sesión de fotos</Label>
            <Input
              placeholder="Nombre de la sesión (opcional, ej. Fondo blanco)"
              value={sesionNombre}
              onChange={e => setSesionNombre(e.target.value)}
            />
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
            <Button onClick={handleUpload} disabled={uploading} size="sm">
              {uploading ? 'Subiendo...' : `Subir ${files.length > 0 ? `(${files.length})` : ''}`}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : sesiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este producto todavía no tiene fotos.</p>
          ) : (
            <div className="space-y-4">
              {sesiones.map(s => (
                <div key={s.sesion_id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{s.sesion_nombre || 'Sesión sin nombre'} ({s.fotos.length})</p>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteSesion(s)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {(urlsBySesion[s.sesion_id] ?? []).map((url, i) => (
                      <img key={i} src={url} alt={s.fotos[i]?.nombre} className="aspect-square object-cover rounded" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
