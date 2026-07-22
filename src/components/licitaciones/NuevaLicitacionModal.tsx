// src/components/licitaciones/NuevaLicitacionModal.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { Licitacion, TipoProceso, TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (lit: Licitacion) => void;
}

const DEFAULT_FORM = {
  nombre:             '',
  entidad:            '',
  numero_sicoes:      '',
  tipo_proceso:       'ANPE' as TipoProceso,
  fecha_presentacion: '',
};

export function NuevaLicitacionModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }

    try {
      setSaving(true);
      const lit = await LicitacionStorage.create({
        nombre:            form.nombre.trim(),
        entidad:           form.entidad.trim(),
        numero_sicoes:     form.numero_sicoes.trim(),
        tipo_proceso:      form.tipo_proceso,
        fecha_presentacion: form.fecha_presentacion || undefined,
        estado:            'BORRADOR',
        // Costos a nivel de licitación: arrancan en 0 (igual que el default en BD)
        garantia_licitacion:     0,
        pasaje_licitacion:       0,
        envio_licitacion:        0,
        otros_costos_licitacion: 0,
        datos_ia:          {},
      });
      toast.success('Licitación creada');
      setForm(DEFAULT_FORM);
      onCreated(lit);
    } catch (err) {
      toast.error('Error al crear la licitación');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Licitación</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              placeholder="Ej: Adquisición de equipos informáticos"
              value={form.nombre}
              onChange={set('nombre')}
              required
            />
          </div>

          {/* Entidad */}
          <div className="space-y-1.5">
            <Label htmlFor="entidad">Entidad</Label>
            <Input
              id="entidad"
              placeholder="Ej: Ministerio de Educación"
              value={form.entidad}
              onChange={set('entidad')}
            />
          </div>

          {/* N° SICOES y Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="numero_sicoes">N° SICOES / CUCE</Label>
              <Input
                id="numero_sicoes"
                placeholder="Ej: ANPE-1663625-1"
                value={form.numero_sicoes}
                onChange={set('numero_sicoes')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de proceso</Label>
              <Select
                value={form.tipo_proceso}
                onValueChange={(v: TipoProceso) => setForm(prev => ({ ...prev, tipo_proceso: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_PROCESO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha presentación */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha_pres">Fecha presentación</Label>
            <Input
              id="fecha_pres"
              type="date"
              value={form.fecha_presentacion}
              onChange={set('fecha_presentacion')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear licitación'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
