// src/components/licitaciones/tabs/TabNotas.tsx
// Genera las 4 notas de la licitación (.docx + PDF). Toma datos fijos de la config
// de empresa, los datos del proceso (DBC) y los productos del cotizador; lo variable
// por licitación se edita aquí y se guarda en datos_ia.notas.

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, FileText, FileDown, FileType2, AlertCircle } from 'lucide-react';
import { Licitacion } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import {
  type NotaTipo, type NotasEmpresaConfig, type LicitacionNotasDatos,
  NOTA_LABELS, NotasConfigStorage, leerNotasDatos,
} from '@/accounting/licitacion-notas';
import { construirNota, descargarNotaDocx, descargarNotaPdf } from '@/accounting/licitacion-notas-generar';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

const NOTAS_ORDEN: NotaTipo[] = ['entrega_documentos', 'nota_entrega', 'garantia', 'solicitud_pago'];

export function TabNotas({ licitacion: l, onUpdated }: Props) {
  const companyId = useActiveCompanyId();
  const [config, setConfig] = useState<NotasEmpresaConfig | null>(null);
  const [datos, setDatos] = useState<LicitacionNotasDatos>(() => leerNotasDatos(l.datos_ia as Record<string, unknown>));
  const [saving, setSaving] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(true);

  useEffect(() => {
    NotasConfigStorage.load(companyId)
      .then(setConfig)
      .catch(() => toast.error('Error al cargar los datos para notas'))
      .finally(() => setLoadingCfg(false));
  }, [companyId]);

  const set = (k: keyof LicitacionNotasDatos) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setDatos(prev => ({ ...prev, [k]: e.target.value }));

  const setItem = (id: string, patch: Partial<{ nro_dbc: string; descripcion: string; unidad: string; cant_garantia: number | null }>) =>
    setDatos(prev => ({
      ...prev,
      items: {
        ...prev.items,
        [id]: { nro_dbc: '', descripcion: '', unidad: '', cant_garantia: null, ...prev.items[id], ...patch },
      },
    }));

  const persistir = async (): Promise<Licitacion> => {
    const nuevosDatos = { ...(l.datos_ia ?? {}), notas: datos };
    const changes: Partial<Licitacion> = { datos_ia: nuevosDatos };
    await LicitacionStorage.update(l.id, companyId, changes);
    const actualizada = { ...l, ...changes };
    onUpdated(actualizada);
    return actualizada;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await persistir();
      toast.success('Datos de notas guardados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const generar = async (tipo: NotaTipo, formato: 'docx' | 'pdf') => {
    if (!config) return;
    try {
      // Guarda primero para que la nota refleje lo editado, y usa la licitación al día.
      const lic = await persistir();
      const nota = construirNota(tipo, lic, config);
      if (formato === 'docx') await descargarNotaDocx(nota);
      else descargarNotaPdf(nota);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al generar la nota');
    }
  };

  const configIncompleta = !!config && (!config.representante || !config.empresa);

  return (
    <div className="space-y-6">
      {configIncompleta && (
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Faltan datos de tu empresa. Cargalos en <span className="font-medium">Licitaciones → «Datos para notas»</span> para que las notas salgan completas.</p>
        </div>
      )}

      {/* Datos del destinatario / carta */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Datos de la carta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tratamiento</Label>
            <Select value={datos.tratamiento} onValueChange={v => setDatos(prev => ({ ...prev, tratamiento: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Señor:">Señor:</SelectItem>
                <SelectItem value="Señora:">Señora:</SelectItem>
                <SelectItem value="Señor(es):">Señor(es):</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Campo label="Destinatario (nombre)" value={datos.destinatario_nombre} onChange={set('destinatario_nombre')} />
          <Campo label="Cargo" value={datos.destinatario_cargo} onChange={set('destinatario_cargo')} />
          <Campo label="Repartición / entidad" value={datos.destinatario_reparticion} onChange={set('destinatario_reparticion')} className="sm:col-span-2 lg:col-span-1" />
          <Campo label="Ciudad" value={datos.ciudad} onChange={set('ciudad')} placeholder={config?.ciudad || 'Sucre'} />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha de la carta</Label>
            <Input type="date" className="h-8 text-sm" value={datos.fecha} onChange={set('fecha')} />
          </div>
          <Campo label="N° de licitación del año (CITE)" value={datos.nro_licitacion_anual} onChange={set('nro_licitacion_anual')} placeholder="Ej: 11" />
        </div>
      </div>

      <Separator />

      {/* Ítems — cantidad y precio del cotizador; el resto se edita */}
      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Ítems
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Cantidad y precio salen del cotizador. La descripción, el N° de ítem del DBC,
          la unidad y la cantidad de garantía se cargan aquí.
        </p>
        {l.productos.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No hay productos en el cotizador de esta licitación.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1.5 w-16">N° ítem</th>
                  <th className="px-2 py-1.5 min-w-[220px]">Descripción</th>
                  <th className="px-2 py-1.5 w-28">Unidad</th>
                  <th className="px-2 py-1.5 w-20">Cantidad</th>
                  <th className="px-2 py-1.5 w-24">Cant. garantía</th>
                  <th className="px-2 py-1.5 w-24 text-right">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {l.productos.map(p => {
                  const ov = datos.items[p.id] ?? { nro_dbc: '', descripcion: '', unidad: '', cant_garantia: null };
                  return (
                    <tr key={p.id} className="align-middle">
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" value={ov.nro_dbc} onChange={e => setItem(p.id, { nro_dbc: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" placeholder={p.nombre} value={ov.descripcion} onChange={e => setItem(p.id, { descripcion: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" placeholder="ROLLO" value={ov.unidad} onChange={e => setItem(p.id, { unidad: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{p.cantidad}</td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min="0" className="h-8 text-xs"
                          value={ov.cant_garantia ?? ''}
                          onChange={e => setItem(p.id, { cant_garantia: e.target.value === '' ? null : Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{p.precio_ofertado?.toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-3">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos de notas'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Generar */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileDown className="h-4 w-4" /> Generar notas
        </h3>
        {loadingCfg ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando config…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NOTAS_ORDEN.map(tipo => (
              <div key={tipo} className="rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{NOTA_LABELS[tipo]}</span>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => generar(tipo, 'docx')}>
                    <FileType2 className="h-3.5 w-3.5" /> Word
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => generar(tipo, 'pdf')}>
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder, className }: {
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
