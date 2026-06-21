import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Download, RotateCcw, DatabaseBackup } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId, useUserAccess } from '@/contexts/UserAccessContext';
import { downloadBackup, restoreFromBackup, BackupData } from '@/services/backupService';

interface Schedule {
  enabled: boolean;
  interval_hours: number;
  retention_count: number;
  last_run_at: string | null;
}

interface BackupRow {
  id: string;
  created_at: string;
  kind: 'auto' | 'manual';
  size_bytes: number | null;
  counts: Record<string, number> | null;
}

const FREQ_PRESETS: Record<string, number> = { diario: 24, doce: 12, semanal: 168 };

function presetFromHours(h: number): string {
  if (h === 24) return 'diario';
  if (h === 12) return 'doce';
  if (h === 168) return 'semanal';
  return 'custom';
}

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AutoBackupsPanel({ onRestoreComplete }: { onRestoreComplete: () => void }) {
  const companyId = useActiveCompanyId();
  const { isOwner } = useUserAccess();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freqPreset, setFreqPreset] = useState('diario');
  const [customHours, setCustomHours] = useState(24);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sched }, { data: list }] = await Promise.all([
        (supabase as any).from('backup_schedules').select('*').eq('company_id', companyId).maybeSingle(),
        (supabase as any).from('company_backups')
          .select('id, created_at, kind, size_bytes, counts')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      ]);
      const s: Schedule = sched ?? { enabled: true, interval_hours: 24, retention_count: 30, last_run_at: null };
      setSchedule(s);
      setFreqPreset(presetFromHours(s.interval_hours));
      setCustomHours(s.interval_hours);
      setBackups((list as BackupRow[]) ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Error cargando backups automáticos');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function saveConfig() {
    if (!schedule) return;
    setSavingCfg(true);
    try {
      const interval = freqPreset === 'custom' ? Math.max(1, Math.min(8760, customHours)) : FREQ_PRESETS[freqPreset];
      const { error } = await (supabase as any).from('backup_schedules').upsert({
        company_id: companyId,
        enabled: schedule.enabled,
        interval_hours: interval,
        retention_count: schedule.retention_count,
      }, { onConflict: 'company_id' });
      if (error) throw error;
      toast.success('Configuración de backup guardada');
      load();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar la configuración');
    } finally {
      setSavingCfg(false);
    }
  }

  async function createNow() {
    setCreating(true);
    try {
      const { error } = await (supabase as any).rpc('create_company_backup', {
        p_company_id: companyId, p_kind: 'manual',
      });
      if (error) throw error;
      toast.success('Backup creado');
      load();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo crear el backup');
    } finally {
      setCreating(false);
    }
  }

  async function fetchPayload(id: string): Promise<BackupData> {
    const { data, error } = await (supabase as any)
      .from('company_backups').select('payload').eq('id', id).single();
    if (error || !data) throw new Error('No se pudo leer el backup');
    return data.payload as BackupData;
  }

  async function downloadOne(id: string) {
    setBusyId(id);
    try {
      const payload = await fetchPayload(id);
      await downloadBackup(payload);
      toast.success('Backup descargado');
    } catch (e: any) {
      toast.error(e.message || 'Error al descargar');
    } finally {
      setBusyId(null);
    }
  }

  async function restoreOne(id: string) {
    if (!window.confirm('Esto reemplazará TODOS los datos actuales de esta empresa con los del backup seleccionado. ¿Continuar?')) return;
    setBusyId(id);
    try {
      const payload = await fetchPayload(id);
      const result = await restoreFromBackup(payload, companyId);
      if (result.success) { toast.success(result.message); onRestoreComplete(); }
      else toast.error(result.message);
    } catch (e: any) {
      toast.error(e.message || 'Error al restaurar');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Configuración (solo owner) */}
      {isOwner && schedule && (
        <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Backup automático</Label>
              <p className="text-xs text-muted-foreground">Copia periódica de esta empresa, guardada en el servidor.</p>
            </div>
            <Switch checked={schedule.enabled} onCheckedChange={v => setSchedule({ ...schedule, enabled: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Frecuencia</Label>
              <Select value={freqPreset} onValueChange={setFreqPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diario</SelectItem>
                  <SelectItem value="doce">Cada 12 horas</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {freqPreset === 'custom' && (
              <div className="space-y-1">
                <Label className="text-xs">Cada cuántas horas</Label>
                <Input type="number" min={1} max={8760} value={customHours}
                  onChange={e => setCustomHours(Number(e.target.value))} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Backups a conservar</Label>
              <Input type="number" min={1} max={365} value={schedule.retention_count}
                onChange={e => setSchedule({ ...schedule, retention_count: Number(e.target.value) })} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {schedule.last_run_at ? `Último: ${new Date(schedule.last_run_at).toLocaleString('es')}` : 'Aún sin ejecutar'}
            </p>
            <Button size="sm" onClick={saveConfig} disabled={savingCfg}>
              {savingCfg && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Crear ahora + lista */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><DatabaseBackup className="w-4 h-4" />Backups guardados</h4>
        <Button size="sm" variant="outline" onClick={createNow} disabled={creating || !isOwner}>
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
          Crear ahora
        </Button>
      </div>

      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Aún no hay backups automáticos.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {backups.map(b => (
            <div key={b.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{new Date(b.created_at).toLocaleString('es')}</span>
                  <Badge variant={b.kind === 'auto' ? 'secondary' : 'outline'} className="text-[10px]">
                    {b.kind === 'auto' ? 'Automático' : 'Manual'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {fmtBytes(b.size_bytes)}
                  {b.counts ? ` · ${b.counts.accounts ?? 0} cuentas · ${b.counts.journal_entries ?? 0} asientos` : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" title="Descargar" onClick={() => downloadOne(b.id)} disabled={busyId === b.id}>
                  {busyId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </Button>
                {isOwner && (
                  <Button variant="ghost" size="icon" title="Restaurar" onClick={() => restoreOne(b.id)} disabled={busyId === b.id}>
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
