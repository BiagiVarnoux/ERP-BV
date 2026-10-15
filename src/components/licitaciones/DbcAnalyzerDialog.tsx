// src/components/licitaciones/DbcAnalyzerDialog.tsx
// Analiza el CRONOGRAMA DE PLAZOS de un DBC. SOLO .docx (Word). Parsea en código
// (plantilla estándar SICOES) y usa Groq como respaldo si el layout es desconocido.

import React, { useRef, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Upload, Loader2, CheckCircle2, AlertCircle,
  FileText, Sparkles, Cpu,
} from 'lucide-react';
import { Licitacion } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import {
  CronogramaItem,
  extractTextFromDocx,
  extraerVentanaCronograma,
  parseCronogramaLocal,
  analizarDbc,
} from '@/services/licitacionAiService';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

interface Props {
  open: boolean;
  onClose: () => void;
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
  // Archivo ya subido (DBC) a analizar automáticamente al abrir. Si se omite, el
  // usuario sube/pega el DBC dentro del diálogo como siempre.
  initialFile?: File | null;
}

type Step = 'idle' | 'extracting' | 'text-ready' | 'analyzing' | 'review' | 'error';

export function DbcAnalyzerDialog({ open, onClose, licitacion, onUpdated, initialFile }: Props) {
  const companyId = useActiveCompanyId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]         = useState<Step>('idle');
  const [fileName, setFileName] = useState('');
  const [dbcText, setDbcText]   = useState('');
  const [result, setResult]     = useState<CronogramaItem[] | null>(null);
  const [fuente, setFuente]     = useState<'local' | 'ia' | null>(null);
  const [errMsg, setErrMsg]     = useState('');
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStep('idle');
    setFileName('');
    setDbcText('');
    setResult(null);
    setFuente(null);
    setErrMsg('');
    setApplying(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Procesar archivo ─────────────────────────────────────────────────────────

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isDocx = name.endsWith('.docx') || name.endsWith('.doc');

    if (!isDocx) {
      toast.error('Solo se admiten archivos Word (.docx)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('El archivo supera los 15 MB');
      return;
    }

    setFileName(file.name);
    setStep('extracting');
    setErrMsg('');

    try {
      const full    = await extractTextFromDocx(file);
      const ventana = extraerVentanaCronograma(full);

      if (ventana.length >= 50) {
        // Cronograma localizado — mostrar la ventana para revisión/edición
        setDbcText(ventana);
        setStep('text-ready');
      } else {
        // No se encontró la tabla del cronograma en el documento
        setDbcText('');
        setStep('idle');
        setErrMsg(
          'No se encontró el "Cronograma de Plazos" en el Word. ' +
          'Verifica que sea el DBC correcto, o copia esa sección de la tabla y pégala en el área de abajo.'
        );
      }
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Error al leer el archivo');
      setStep('idle');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  // Si se abre con un archivo ya subido (DBC desde la lista de documentos), lo
  // procesa automáticamente una sola vez.
  const processedRef = useRef<File | null>(null);
  useEffect(() => {
    if (!open) { processedRef.current = null; return; }
    if (initialFile && processedRef.current !== initialFile) {
      processedRef.current = initialFile;
      processFile(initialFile);
    }
  }, [open, initialFile]);

  // ── Análisis con Groq ────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    const texto = dbcText.trim();
    if (!texto) { toast.error('No hay texto para analizar'); return; }

    // 1) Parser determinista (plantilla estándar SICOES) — gratis e instantáneo.
    const local = parseCronogramaLocal(texto);
    if (local.length > 0) {
      setResult(local);
      setFuente('local');
      setStep('review');
      return;
    }

    // 2) Respaldo: modelo Groq, por si el layout no es el estándar.
    setStep('analyzing');
    try {
      const ext = await analizarDbc(texto);
      setResult(ext.cronograma);
      setFuente('ia');
      setStep('review');
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Error al analizar');
      setStep('error');
    }
  };

  // ── Aplicar resultados ───────────────────────────────────────────────────────

  const handleApply = async () => {
    if (!result) return;
    try {
      setApplying(true);
      // El cronograma es la fuente de fechas del proceso: se guarda en datos_ia
      // (jsonb). Las columnas antiguas de fechas no se tocan.
      const nuevosDatos = { ...(licitacion.datos_ia ?? {}), cronograma: result };
      const changes: Partial<Licitacion> = { datos_ia: nuevosDatos };

      await LicitacionStorage.update(licitacion.id, companyId, changes);
      onUpdated({ ...licitacion, ...changes });
      toast.success('Cronograma guardado en el proceso');
      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setApplying(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasData = !!result && result.length > 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Analizar cronograma del DBC
          </DialogTitle>
          <DialogDescription>
            Sube el DBC en Word (.docx) o pega la tabla del cronograma.
            Se extrae el Cronograma de Plazos (actividad, fecha y hora).
          </DialogDescription>
        </DialogHeader>

        {/* ── IDLE / texto-listo: zona de carga + textarea ── */}
        {(step === 'idle' || step === 'text-ready') && (
          <div className="space-y-4">

            {/* Zona drag & drop */}
            <div
              className={`border-2 border-dashed rounded-xl px-6 py-5 flex items-center gap-4 cursor-pointer transition-colors
                ${dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/10'
                }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className={`h-8 w-8 shrink-0 ${dragging ? 'text-primary' : 'text-muted-foreground/40'}`} />
              <div>
                {step === 'text-ready' ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">{fileName}</p>
                    <span className="text-xs text-muted-foreground">— cronograma localizado</span>
                  </div>
                ) : (
                  <p className="text-sm font-medium">
                    {dragging ? 'Suelta aquí' : 'Arrastra el DBC o haz clic'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">Word (.docx) · máx. 15 MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".doc,.docx" className="hidden" onChange={handleFileInput} />
            </div>

            {/* Error de extracción */}
            {errMsg && (
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{errMsg}</p>
              </div>
            )}

            {/* Textarea para revisar/editar o pegar manualmente */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {step === 'text-ready'
                  ? 'Cronograma localizado — puedes editar antes de analizar:'
                  : 'O pega la tabla del Cronograma de Plazos directamente aquí:'}
              </label>
              <Textarea
                placeholder="Pega aquí la tabla del Cronograma de Plazos copiada desde el Word…"
                value={dbcText}
                onChange={e => setDbcText(e.target.value)}
                rows={8}
                className="text-xs font-mono resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {dbcText.length.toLocaleString()} caracteres
              </p>
            </div>

            <Button
              className="w-full gap-2"
              disabled={!dbcText.trim()}
              onClick={runAnalysis}
            >
              <Sparkles className="h-4 w-4" />
              Analizar cronograma
            </Button>
          </div>
        )}

        {/* ── EXTRACTING ── */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Extrayendo texto del archivo…</p>
            <p className="text-xs flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{fileName}</p>
          </div>
        )}

        {/* ── ANALYZING ── */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <Loader2 className="h-16 w-16 animate-spin text-primary/25 absolute inset-0" />
            </div>
            <div className="text-center">
              <p className="font-semibold">El agente está leyendo el cronograma…</p>
              <p className="text-sm text-muted-foreground mt-1">Esto toma unos segundos</p>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-destructive/10 text-destructive rounded-lg px-4 py-3">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Error al analizar</p>
                <p className="text-xs mt-0.5 opacity-80">{errMsg}</p>
              </div>
            </div>
            <Button className="w-full" variant="outline" onClick={() => setStep(dbcText ? 'text-ready' : 'idle')}>
              Volver a intentar
            </Button>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === 'review' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium text-green-700 dark:text-green-400">
                Cronograma detectado ({result.length})
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
                {fuente === 'ia'
                  ? <><Sparkles className="h-3 w-3 text-primary" /> vía IA</>
                  : <><Cpu className="h-3 w-3" /> detectado localmente</>}
              </span>
            </div>

            {hasData ? (
              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5 w-7 text-right">#</th>
                        <th className="px-2 py-1.5">Actividad</th>
                        <th className="px-2 py-1.5 whitespace-nowrap">Fecha</th>
                        <th className="px-2 py-1.5 whitespace-nowrap">Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.map((it, i) => (
                        <tr key={i} className="align-top">
                          <td className="px-2 py-1.5 text-right text-muted-foreground">{it.nro ?? '·'}</td>
                          <td className="px-2 py-1.5">{it.actividad || <span className="text-muted-foreground/40 italic">—</span>}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap font-medium">{fmtFecha(it.fecha)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap font-medium">
                            {it.hora || <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
                No se detectaron actividades en el texto.<br />
                <span className="text-xs">Verifica que sea la tabla del Cronograma de Plazos.</span>
              </p>
            )}

            {hasData && (
              <p className="text-[11px] text-muted-foreground">Se guardará en los datos del proceso.</p>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep('text-ready')} className="flex-1">
                Editar texto
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying || !hasData}
                className="flex-1 gap-2"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {applying ? 'Guardando…' : 'Guardar cronograma'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Formato de fecha es-BO ──────────────────────────────────────────────────

function fmtFecha(value: string): React.ReactNode {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  try {
    return new Date(value + 'T12:00:00').toLocaleDateString('es-BO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return value;
  }
}
