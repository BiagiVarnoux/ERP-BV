// src/components/licitaciones/tabs/TabProceso.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Licitacion, LicitacionEstado } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import type { CronogramaItem } from '@/services/licitacionAiService';
import { CalendarDays, CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

export function TabProceso({ licitacion: l, onUpdated }: Props) {
  const companyId = useActiveCompanyId();
  const [form, setForm] = useState({
    fecha_presentacion:     l.fecha_presentacion     || '',
    fecha_adjudicacion_est: l.fecha_adjudicacion_est || '',
    fecha_contrato:         l.fecha_contrato         || '',
    plazo_entrega_dias:     l.plazo_entrega_dias?.toString() || '',
    fecha_limite_entrega:   l.fecha_limite_entrega   || '',
    fecha_entrega_real:     l.fecha_entrega_real     || '',
    notas:                  l.notas                  || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      const changes = {
        fecha_presentacion:     form.fecha_presentacion     || undefined,
        fecha_adjudicacion_est: form.fecha_adjudicacion_est || undefined,
        fecha_contrato:         form.fecha_contrato         || undefined,
        plazo_entrega_dias:     form.plazo_entrega_dias ? parseInt(form.plazo_entrega_dias) : undefined,
        fecha_limite_entrega:   form.fecha_limite_entrega   || undefined,
        fecha_entrega_real:     form.fecha_entrega_real     || undefined,
        notas:                  form.notas                  || undefined,
      };
      await LicitacionStorage.update(l.id, companyId, changes);
      onUpdated({ ...l, ...changes });
      toast.success('Proceso actualizado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Cronograma extraído del DBC (solo lectura; se guarda desde "Analizar DBC")
  const cronograma = Array.isArray((l.datos_ia as Record<string, unknown>)?.cronograma)
    ? ((l.datos_ia as Record<string, unknown>).cronograma as CronogramaItem[])
    : [];

  // Línea de tiempo
  const estadosOrden: LicitacionEstado[] = ['BORRADOR', 'PRESENTADA', 'ADJUDICADA', 'ENTREGADA'];
  const idxEstadoActual = estadosOrden.indexOf(l.estado as LicitacionEstado);

  const hitos = [
    { label: 'Borrador',             done: true,                   fecha: undefined },
    { label: 'Presentada',           done: idxEstadoActual >= 1,   fecha: l.fecha_presentacion },
    { label: 'Nota de Adjudicación', done: idxEstadoActual >= 2,   fecha: l.fecha_adjudicacion_est },
    { label: 'Contrato / OC',        done: !!l.fecha_contrato,     fecha: l.fecha_contrato },
    { label: 'Bienes entregados',    done: !!l.fecha_entrega_real, fecha: l.fecha_entrega_real },
  ];

  return (
    <div className="space-y-6">
      {/* Línea de tiempo */}
      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {hitos.map((h, i) => (
          <React.Fragment key={h.label}>
            <div className="flex flex-col items-center min-w-[110px]">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                h.done
                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                  : 'border-muted-foreground/30 bg-background'
              }`}>
                {h.done
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <Circle className="h-4 w-4 text-muted-foreground/40" />}
              </div>
              <p className="text-[10px] text-center mt-1.5 text-muted-foreground leading-tight px-1">
                {h.label}
              </p>
              {h.fecha && (
                <p className="text-[10px] text-center font-mono text-muted-foreground/70 mt-0.5">
                  {new Date(h.fecha + 'T12:00:00').toLocaleDateString('es-BO', {
                    day: '2-digit', month: 'short',
                  })}
                </p>
              )}
            </div>
            {i < hitos.length - 1 && (
              <div className={`flex-1 h-0.5 mt-4 min-w-[24px] ${
                h.done && hitos[i + 1].done ? 'bg-green-400' : 'bg-muted-foreground/20'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <Separator />

      {/* Fechas */}
      <div>
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Fechas clave
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DateField
            id="fecha_pres"
            label="Fecha de presentación"
            value={form.fecha_presentacion}
            onChange={set('fecha_presentacion')}
          />
          <DateField
            id="fecha_adj_est"
            label="Fecha adjudicación (est.)"
            value={form.fecha_adjudicacion_est}
            onChange={set('fecha_adjudicacion_est')}
          />
          <DateField
            id="fecha_contrato"
            label="Fecha contrato / OC"
            hint="Desde aquí corren los plazos"
            value={form.fecha_contrato}
            onChange={set('fecha_contrato')}
          />
          <div className="space-y-1.5">
            <Label htmlFor="plazo_dias">Plazo de entrega (días)</Label>
            <Input
              id="plazo_dias"
              type="number"
              min="0"
              placeholder="Ej: 30"
              value={form.plazo_entrega_dias}
              onChange={set('plazo_entrega_dias')}
            />
          </div>
          <DateField
            id="fecha_limite"
            label="Fecha límite entrega"
            value={form.fecha_limite_entrega}
            onChange={set('fecha_limite_entrega')}
          />
          <DateField
            id="fecha_real"
            label="Fecha entrega real"
            value={form.fecha_entrega_real}
            onChange={set('fecha_entrega_real')}
          />
        </div>
      </div>

      {/* Cronograma de Plazos (extraído del DBC) */}
      {cronograma.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Cronograma de Plazos
              <span className="text-xs font-normal text-muted-foreground">
                — {cronograma.length} actividades · extraído del DBC
              </span>
            </h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5 w-7 text-right">#</th>
                      <th className="px-2 py-1.5">Actividad</th>
                      <th className="px-2 py-1.5 whitespace-nowrap">Fecha</th>
                      <th className="px-2 py-1.5 whitespace-nowrap">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cronograma.map((it, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{it.nro ?? '·'}</td>
                        <td className="px-2 py-1.5">
                          {it.actividad || <span className="text-muted-foreground/40 italic">—</span>}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-medium">{fmtFechaCorta(it.fecha)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-medium">
                          {it.hora || <span className="text-muted-foreground/40">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Notas */}
      <div className="space-y-2">
        <Label htmlFor="notas">Notas del proceso</Label>
        <Textarea
          id="notas"
          placeholder="Observaciones, detalles administrativos, recordatorios..."
          value={form.notas}
          onChange={set('notas')}
          rows={4}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar proceso'}
        </Button>
      </div>
    </div>
  );
}

function DateField({ id, label, hint, value, onChange }: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {hint && (
          <span className="ml-1 text-xs text-muted-foreground font-normal">— {hint}</span>
        )}
      </Label>
      <Input id={id} type="date" value={value} onChange={onChange} />
    </div>
  );
}

function fmtFechaCorta(value: string): React.ReactNode {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  try {
    return new Date(value + 'T12:00:00').toLocaleDateString('es-BO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return value;
  }
}
