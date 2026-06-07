// src/components/licitaciones/tabs/TabGeneral.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Licitacion, TipoProceso, TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

export function TabGeneral({ licitacion: l, onUpdated }: Props) {
  const [form, setForm] = useState({
    nombre:            l.nombre,
    entidad:           l.entidad,
    numero_sicoes:     l.numero_sicoes,
    tipo_proceso:      l.tipo_proceso,
    precio_referencial: l.precio_referencial?.toString() || '',
    embarque_id:       l.embarque_id || '',
    notas:             l.notas || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      setSaving(true);
      const changes = {
        nombre:            form.nombre.trim(),
        entidad:           form.entidad.trim(),
        numero_sicoes:     form.numero_sicoes.trim(),
        tipo_proceso:      form.tipo_proceso,
        precio_referencial: form.precio_referencial ? Number(form.precio_referencial) : undefined,
        embarque_id:       form.embarque_id.trim() || undefined,
      };
      await LicitacionStorage.update(l.id, changes);
      onUpdated({ ...l, ...changes });
      toast.success('Datos actualizados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Identificación */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Identificación del proceso</h3>

        <div className="space-y-1.5">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input id="nombre" value={form.nombre} onChange={set('nombre')} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entidad">Entidad contratante</Label>
          <Input id="entidad" value={form.entidad} onChange={set('entidad')} placeholder="Ej: Ministerio de Educación" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sicoes">N° SICOES / CUCE</Label>
            <Input id="sicoes" value={form.numero_sicoes} onChange={set('numero_sicoes')} placeholder="ANPE-1663625-1" />
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

        <div className="space-y-1.5">
          <Label htmlFor="precio_ref">Precio referencial (Bs)</Label>
          <Input
            id="precio_ref"
            type="number"
            min="0"
            step="0.01"
            value={form.precio_referencial}
            onChange={set('precio_referencial')}
            placeholder="0.00"
            className="max-w-[200px]"
          />
        </div>
      </div>

      <Separator />

      {/* Vínculo embarque */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Vínculo a embarque <span className="font-normal text-muted-foreground">(opcional)</span></h3>
        <div className="space-y-1.5">
          <Label htmlFor="embarque">ID de Embarque</Label>
          <Input
            id="embarque"
            value={form.embarque_id}
            onChange={set('embarque_id')}
            placeholder="Pegar el ID del embarque vinculado"
          />
          <p className="text-xs text-muted-foreground">
            Puedes vincular esta licitación a un embarque existente. No es obligatorio ni automático.
          </p>
        </div>
      </div>

      <Separator />

      {/* Meta */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Creado: {new Date(l.created_at).toLocaleString('es-BO')}</p>
        <p>Última actualización: {new Date(l.updated_at).toLocaleString('es-BO')}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
