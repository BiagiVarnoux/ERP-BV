// src/components/licitaciones/NotasConfigModal.tsx
// Panel "Datos para notas" — datos fijos del proveedor por empresa, reutilizados en
// todas las notas de licitación. Se carga/guarda en licitacion_notas_config.

import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { NotasEmpresaConfig, NotasConfigStorage, NOTAS_CONFIG_DEFAULT } from '@/accounting/licitacion-notas';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotasConfigModal({ open, onClose }: Props) {
  const companyId = useActiveCompanyId();
  const [cfg, setCfg] = useState<NotasEmpresaConfig>({ ...NOTAS_CONFIG_DEFAULT });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    NotasConfigStorage.load(companyId)
      .then(setCfg)
      .catch(() => toast.error('Error al cargar la configuración'))
      .finally(() => setLoading(false));
  }, [open, companyId]);

  const set = (k: keyof NotasEmpresaConfig) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setCfg(prev => ({ ...prev, [k]: e.target.value }));

  const setDoc = (i: number, v: string) =>
    setCfg(prev => ({ ...prev, documentos: prev.documentos.map((d, idx) => (idx === i ? v : d)) }));
  const addDoc = () => setCfg(prev => ({ ...prev, documentos: [...prev.documentos, ''] }));
  const removeDoc = (i: number) =>
    setCfg(prev => ({ ...prev, documentos: prev.documentos.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    try {
      setSaving(true);
      const limpio: NotasEmpresaConfig = {
        ...cfg,
        documentos: cfg.documentos.map(d => d.trim()).filter(Boolean),
      };
      await NotasConfigStorage.save(companyId, limpio);
      setCfg(limpio);
      toast.success('Datos para notas guardados');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Datos para notas
          </DialogTitle>
          <DialogDescription>
            Datos fijos del proveedor que se repiten en las notas de todas las
            licitaciones. Se cargan una vez por empresa.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Representante" value={cfg.representante} onChange={set('representante')} placeholder="Carlos Fabrizio Cuellar Salazar" />
              <Field label="Rol" value={cfg.rol} onChange={set('rol')} placeholder="propietario" />
              <Field label="Empresa" value={cfg.empresa} onChange={set('empresa')} placeholder="Biagi & Varnoux - Import and Export" className="sm:col-span-2" />
              <Field label="NIT" value={cfg.nit} onChange={set('nit')} />
              <Field label="Ciudad (encabezado)" value={cfg.ciudad} onChange={set('ciudad')} placeholder="Sucre" />
              <Field label="Prefijo de CITE" value={cfg.cite_prefijo} onChange={set('cite_prefijo')} placeholder="BV/LC" />
              <div />
              <Field label="Banco" value={cfg.banco} onChange={set('banco')} placeholder="Banco Unión" />
              <Field label="N° de cuenta" value={cfg.cuenta} onChange={set('cuenta')} placeholder="10000065282043" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Documentos (nota «Entrega de Documentos»)
                </Label>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={addDoc}>
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              <div className="space-y-1.5">
                {cfg.documentos.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="h-8 text-xs" value={d} onChange={e => setDoc(i, e.target.value)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeDoc(i)} aria-label="Eliminar documento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder, className }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="h-8 text-sm" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
