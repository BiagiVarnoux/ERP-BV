// src/components/licitaciones/tabs/TabGeneral.tsx
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Licitacion, TipoProceso, TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { fmt, round2 } from '@/accounting/utils';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

export function TabGeneral({ licitacion: l, onUpdated }: Props) {
  const companyId = useActiveCompanyId();
  const [form, setForm] = useState({
    nombre:            l.nombre,
    entidad:           l.entidad,
    numero_sicoes:     l.numero_sicoes,
    tipo_proceso:      l.tipo_proceso,
    embarque_id:       l.embarque_id || '',
    notas:             l.notas || '',
  });
  const [saving, setSaving] = useState(false);

  // Precio referencial (presupuesto de la entidad) y tu oferta total, derivados
  // de la cotización — precio_entidad y precio_ofertado son por unidad.
  const totales = useMemo(() => {
    const refEntidad = round2(l.productos.reduce((s, p) => s + (p.precio_entidad || 0) * (p.cantidad || 0), 0));
    const totalOfertado = round2(l.productos.reduce((s, p) => s + (p.precio_ofertado || 0) * (p.cantidad || 0), 0));
    const faltanEntidad = l.productos.some(p => !p.precio_entidad);
    const pctVsRef = refEntidad > 0 ? (totalOfertado - refEntidad) / refEntidad : null;
    return { refEntidad, totalOfertado, faltanEntidad, pctVsRef, sinProductos: l.productos.length === 0 };
  }, [l.productos]);

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
        embarque_id:       form.embarque_id.trim() || undefined,
      };
      await LicitacionStorage.update(l.id, companyId, changes);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div className="space-y-2">
          <Label>Precio referencial y oferta</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Precio referencial (entidad)</p>
              <p className="text-lg font-semibold font-mono">Bs {fmt(totales.refEntidad)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Tu oferta total</p>
              <p className="text-lg font-semibold font-mono">Bs {fmt(totales.totalOfertado)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Tu oferta vs referencial</p>
              {totales.pctVsRef == null ? (
                <p className="text-lg font-semibold font-mono text-muted-foreground">—</p>
              ) : (
                <p className={`text-lg font-semibold font-mono ${totales.pctVsRef <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {totales.pctVsRef > 0 ? '+' : ''}{(totales.pctVsRef * 100).toFixed(1)}%
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {totales.pctVsRef <= 0 ? 'bajo referencial' : 'sobre referencial'}
                  </span>
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ambos se calculan de la pestaña <strong>Cotización</strong> (precio de entidad y precio ofertado por producto).
            Se guardan al guardar la cotización.
          </p>
          {totales.sinProductos ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Aún no hay productos en la cotización.
            </p>
          ) : totales.faltanEntidad && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Algunos productos no tienen cargado el precio de entidad — el referencial puede estar incompleto.
            </p>
          )}
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
        <p>Creado: {new Date(l.created_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
        <p>Última actualización: {new Date(l.updated_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
