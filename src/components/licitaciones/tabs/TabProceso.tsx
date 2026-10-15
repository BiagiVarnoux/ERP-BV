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
import { type CronogramaItem, mapearCronogramaAFechas } from '@/services/licitacionAiService';
import { CheckCircle2, Circle, ListChecks, Plus, Trash2 } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

function leerCronograma(l: Licitacion): CronogramaItem[] {
  const raw = (l.datos_ia as Record<string, unknown>)?.cronograma;
  return Array.isArray(raw) ? (raw as CronogramaItem[]) : [];
}

export function TabProceso({ licitacion: l, onUpdated }: Props) {
  const companyId = useActiveCompanyId();

  // El cronograma es ahora la ÚNICA fuente de fechas del proceso. Se puede extraer
  // con "Analizar DBC" o llenar/corregir a mano aquí (no todos los DBC se leen bien).
  const [crono, setCrono] = useState<CronogramaItem[]>(() => leerCronograma(l));
  const [notas, setNotas] = useState(l.notas || '');
  const [saving, setSaving] = useState(false);

  const updateRow = (i: number, patch: Partial<CronogramaItem>) =>
    setCrono(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setCrono(prev => [...prev, { nro: prev.length + 1, actividad: '', fecha: '', hora: '' }]);

  const removeRow = (i: number) =>
    setCrono(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    try {
      setSaving(true);
      // Se descartan filas totalmente vacías. Las fechas/columnas antiguas no se
      // tocan (se conservan en la BD); la fuente visible pasa a ser el cronograma.
      const limpio: CronogramaItem[] = crono
        .map(r => ({
          nro: r.nro ?? null,
          actividad: (r.actividad || '').trim(),
          fecha: r.fecha || '',
          hora: r.hora || '',
        }))
        .filter(r => r.actividad || r.fecha || r.hora);

      const nuevosDatos = { ...(l.datos_ia ?? {}), cronograma: limpio };
      const changes: Partial<Licitacion> = {
        datos_ia: nuevosDatos,
        notas: notas || undefined,
      };

      await LicitacionStorage.update(l.id, companyId, changes);
      onUpdated({ ...l, ...changes });
      setCrono(limpio);
      toast.success('Proceso actualizado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Línea de tiempo — alimentada por el cronograma (presentación / adjudicación /
  // contrato). "done" sigue el estado de la licitación.
  const fechas = mapearCronogramaAFechas(crono);
  const estadosOrden: LicitacionEstado[] = ['BORRADOR', 'PRESENTADA', 'ADJUDICADA', 'ENTREGADA'];
  const idxEstadoActual = estadosOrden.indexOf(l.estado as LicitacionEstado);

  const hitos = [
    { label: 'Borrador',             done: true,                        fecha: undefined as string | undefined },
    { label: 'Presentada',           done: idxEstadoActual >= 1,        fecha: fechas.fecha_presentacion },
    { label: 'Nota de Adjudicación', done: idxEstadoActual >= 2,        fecha: fechas.fecha_adjudicacion_est },
    { label: 'Contrato / OC',        done: !!fechas.fecha_contrato,     fecha: fechas.fecha_contrato },
    { label: 'Bienes entregados',    done: idxEstadoActual >= 3,        fecha: l.fecha_entrega_real },
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

      {/* Cronograma de Plazos (editable) */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Cronograma de Plazos
            {crono.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                — {crono.length} actividad{crono.length !== 1 ? 'es' : ''}
              </span>
            )}
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Agregar actividad
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Se extrae con «Analizar DBC» (pestaña Documentos) o se llena y corrige a mano aquí.
        </p>

        {crono.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Sin actividades. Usa «Agregar actividad» o extrae el cronograma desde el DBC.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-1.5 w-12">#</th>
                    <th className="px-2 py-1.5 min-w-[180px]">Actividad</th>
                    <th className="px-2 py-1.5 w-40">Fecha</th>
                    <th className="px-2 py-1.5 w-28">Hora</th>
                    <th className="px-2 py-1.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {crono.map((it, i) => (
                    <tr key={i} className="align-middle">
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min="0"
                          className="h-8 text-xs"
                          value={it.nro ?? ''}
                          onChange={e => updateRow(i, {
                            nro: e.target.value === '' ? null : parseInt(e.target.value, 10),
                          })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Nombre de la actividad"
                          value={it.actividad}
                          onChange={e => updateRow(i, { actividad: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={it.fecha}
                          onChange={e => updateRow(i, { fecha: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="time"
                          className="h-8 text-xs"
                          value={it.hora}
                          onChange={e => updateRow(i, { hora: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(i)}
                          aria-label="Eliminar actividad"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Notas */}
      <div className="space-y-2">
        <Label htmlFor="notas">Notas del proceso</Label>
        <Textarea
          id="notas"
          placeholder="Observaciones, detalles administrativos, recordatorios..."
          value={notas}
          onChange={e => setNotas(e.target.value)}
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
