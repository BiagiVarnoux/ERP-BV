// src/components/licitaciones/tabs/TabProceso.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Licitacion, LicitacionEstado } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import {
  type CronogramaItem, type CronogramaKey, type DatosProcesoDbc,
  CRONOGRAMA_CATALOGO, mapearCronogramaAFechas, cronogramaOrden, conKeys,
} from '@/services/licitacionAiService';
import { CheckCircle2, Circle, ListChecks, Plus, Trash2, Clock, FileText } from 'lucide-react';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

function leerCronograma(l: Licitacion): CronogramaItem[] {
  const raw = (l.datos_ia as Record<string, unknown>)?.cronograma;
  const arr = Array.isArray(raw) ? (raw as CronogramaItem[]) : [];
  // Clasifica los que no traigan key (legados) y ordena por la plantilla estándar.
  return conKeys(arr).sort((a, b) => cronogramaOrden(a.key) - cronogramaOrden(b.key));
}

// Helpers de fecha
const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtLargo = (iso?: string): string => {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-BO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
};
const diasDesdeHoy = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
};

export function TabProceso({ licitacion: l, onUpdated }: Props) {
  const companyId = useActiveCompanyId();

  // El cronograma (con su actividad canónica) es la fuente de fechas del proceso.
  const [crono, setCrono] = useState<CronogramaItem[]>(() => leerCronograma(l));
  const [plazoStr, setPlazoStr] = useState(l.plazo_entrega_dias?.toString() || '');
  const [notas, setNotas] = useState(l.notas || '');
  const [saving, setSaving] = useState(false);

  // Datos oficiales del proceso extraídos del DBC (separados de los campos de
  // General, que son cómo el usuario identifica la licitación).
  const [proc, setProc] = useState<DatosProcesoDbc>(() => {
    const p = (l.datos_ia as Record<string, unknown>)?.proceso as DatosProcesoDbc | undefined;
    return {
      entidad_convocante:  p?.entidad_convocante  || '',
      cuce:                p?.cuce                || '',
      objeto_contratacion: p?.objeto_contratacion || '',
    };
  });
  const setProcField = (k: keyof DatosProcesoDbc) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProc(prev => ({ ...prev, [k]: e.target.value }));

  const usedKeys = new Set(crono.map(r => r.key).filter((k): k is CronogramaKey => !!k && k !== 'otro'));

  const updateRow = (i: number, patch: Partial<CronogramaItem>) =>
    setCrono(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onSelectActividad = (i: number, key: CronogramaKey) => {
    if (key === 'otro') {
      const actual = crono[i];
      const eraCatalogo = actual.key && actual.key !== 'otro';
      updateRow(i, { key: 'otro', nro: null, actividad: eraCatalogo ? '' : actual.actividad });
    } else {
      const def = CRONOGRAMA_CATALOGO.find(d => d.key === key);
      updateRow(i, { key, actividad: def?.label ?? '', nro: cronogramaOrden(key) });
    }
  };

  const addRow = () =>
    setCrono(prev => [...prev, { key: undefined, nro: null, actividad: '', fecha: '', hora: '' }]);

  const removeRow = (i: number) =>
    setCrono(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    try {
      setSaving(true);
      const limpio: CronogramaItem[] = crono
        .map(r => ({
          key: r.key,
          nro: r.key && r.key !== 'otro' ? cronogramaOrden(r.key) : (r.nro ?? null),
          actividad: (r.actividad || '').trim(),
          fecha: r.fecha || '',
          hora: r.hora || '',
        }))
        .filter(r => (r.key && r.key !== 'otro') || r.actividad || r.fecha || r.hora)
        .sort((a, b) => cronogramaOrden(a.key) - cronogramaOrden(b.key));

      const plazo = plazoStr.trim() ? parseInt(plazoStr, 10) : null;
      const nuevosDatos: Record<string, unknown> = { ...(l.datos_ia ?? {}), cronograma: limpio };
      const procTrim: DatosProcesoDbc = {
        entidad_convocante:  proc.entidad_convocante.trim(),
        cuce:                proc.cuce.trim(),
        objeto_contratacion: proc.objeto_contratacion.trim(),
      };
      if (procTrim.entidad_convocante || procTrim.cuce || procTrim.objeto_contratacion) {
        nuevosDatos.proceso = procTrim;
      }
      const changes: Partial<Licitacion> = {
        datos_ia: nuevosDatos,
        plazo_entrega_dias: plazo ?? undefined,
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

  // ── Derivados ────────────────────────────────────────────────────────────────
  const fechas = mapearCronogramaAFechas(crono);
  const plazoNum = plazoStr.trim() ? parseInt(plazoStr, 10) : null;
  const fechaLimiteEntrega = (fechas.fecha_contrato && plazoNum != null && plazoNum > 0)
    ? addDays(fechas.fecha_contrato, plazoNum)
    : '';
  const diasPresentacion = diasDesdeHoy(fechas.fecha_presentacion);

  // ── Línea de tiempo ────────────────────────────────────────────────────────
  const estadosOrden: LicitacionEstado[] = ['BORRADOR', 'PRESENTADA', 'GANADA', 'ADJUDICADA', 'ENTREGADA'];
  const idxEstadoActual = estadosOrden.indexOf(l.estado as LicitacionEstado);
  const hitos = [
    { label: 'Borrador',             done: true,                    fecha: undefined as string | undefined },
    { label: 'Presentada',           done: idxEstadoActual >= 1,    fecha: fechas.fecha_presentacion },
    { label: 'Ganada',               done: idxEstadoActual >= 2,    fecha: undefined },
    { label: 'Nota de Adjudicación', done: idxEstadoActual >= 3,    fecha: fechas.fecha_adjudicacion_est },
    { label: 'Contrato / OC',        done: !!fechas.fecha_contrato, fecha: fechas.fecha_contrato },
    { label: 'Bienes entregados',    done: idxEstadoActual >= 4,    fecha: l.fecha_entrega_real || fechaLimiteEntrega },
  ];

  return (
    <div className="space-y-6">
      {/* Datos oficiales del proceso (del DBC) — distintos de los de General */}
      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Datos del proceso (del DBC)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Datos oficiales exactos del pliego. No reemplazan tus campos de «General»
          (nombre, entidad y N° SICOES), que son tu forma de identificar la licitación.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="proc_entidad" className="text-xs text-muted-foreground">Entidad convocante</Label>
            <Input id="proc_entidad" className="h-8 text-sm" placeholder="Ej: Ministerio de la Presidencia"
              value={proc.entidad_convocante} onChange={setProcField('entidad_convocante')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proc_cuce" className="text-xs text-muted-foreground">CUCE</Label>
            <Input id="proc_cuce" className="h-8 text-sm font-mono" placeholder="Ej: 26-0025-00-1676174-1-1"
              value={proc.cuce} onChange={setProcField('cuce')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="proc_objeto" className="text-xs text-muted-foreground">Objeto de la contratación</Label>
            <Textarea id="proc_objeto" rows={2} className="text-sm"
              placeholder="Descripción oficial del objeto de contratación"
              value={proc.objeto_contratacion} onChange={setProcField('objeto_contratacion')} />
          </div>
        </div>
      </div>

      <Separator />

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

      {/* Resumen de plazos (derivado del cronograma) */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Resumen de plazos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ResumenCard
            label="Presentación de propuestas"
            valor={fmtLargo(fechas.fecha_presentacion)}
            extra={diasPresentacion != null
              ? (diasPresentacion >= 0 ? `faltan ${diasPresentacion} días` : `hace ${-diasPresentacion} días`)
              : undefined}
          />
          <ResumenCard label="Adjudicación estimada" valor={fmtLargo(fechas.fecha_adjudicacion_est)} />
          <ResumenCard label="Firma de contrato / OC" valor={fmtLargo(fechas.fecha_contrato)} />

          {/* Plazo de entrega (editable) */}
          <div className="rounded-lg border px-3 py-2.5 space-y-1.5">
            <Label htmlFor="plazo_dias" className="text-xs text-muted-foreground">Plazo de entrega (días)</Label>
            <Input
              id="plazo_dias"
              type="number"
              min="0"
              className="h-8 text-sm"
              placeholder="Ej: 15"
              value={plazoStr}
              onChange={e => setPlazoStr(e.target.value)}
            />
          </div>
          <ResumenCard
            label="Fecha límite de entrega"
            valor={fmtLargo(fechaLimiteEntrega)}
            extra={fechaLimiteEntrega ? 'contrato + plazo' : undefined}
          />
        </div>
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
          Elige la actividad de la lista estándar para que el sistema la reconozca.
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
                    <th className="px-2 py-1.5 w-9 text-right">#</th>
                    <th className="px-2 py-1.5 min-w-[220px]">Actividad</th>
                    <th className="px-2 py-1.5 w-40">Fecha</th>
                    <th className="px-2 py-1.5 w-28">Hora</th>
                    <th className="px-2 py-1.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {crono.map((it, i) => {
                    const orden = cronogramaOrden(it.key);
                    return (
                      <tr key={i} className="align-middle">
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {orden <= 13 ? orden : '·'}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={it.key}
                            onValueChange={v => onSelectActividad(i, v as CronogramaKey)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Elegí la actividad…" />
                            </SelectTrigger>
                            <SelectContent>
                              {CRONOGRAMA_CATALOGO.map(d => (
                                <SelectItem
                                  key={d.key}
                                  value={d.key}
                                  disabled={usedKeys.has(d.key) && it.key !== d.key}
                                >
                                  {d.label}
                                </SelectItem>
                              ))}
                              <SelectItem value="otro">Otra actividad…</SelectItem>
                            </SelectContent>
                          </Select>
                          {it.key === 'otro' && (
                            <Input
                              className="h-8 text-xs mt-1.5"
                              placeholder="Nombre de la actividad"
                              value={it.actividad}
                              onChange={e => updateRow(i, { actividad: e.target.value })}
                            />
                          )}
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
                    );
                  })}
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

function ResumenCard({ label, valor, extra }: { label: string; valor: string; extra?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-1">{valor}</p>
      {extra && <p className="text-[11px] text-muted-foreground mt-0.5">{extra}</p>}
    </div>
  );
}
