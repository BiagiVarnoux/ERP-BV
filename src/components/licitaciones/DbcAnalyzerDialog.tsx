// src/components/licitaciones/DbcAnalyzerDialog.tsx
// Analiza un DBC con Groq IA. Soporta PDF, Word (.docx) y texto pegado manualmente.

import React, { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Upload, Loader2, CheckCircle2, AlertCircle,
  FileText, Sparkles, X, ChevronRight,
} from 'lucide-react';
import { Licitacion } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import {
  DbcExtraccion,
  extractTextFromPdf,
  extractTextFromDocx,
  analizarDbc,
} from '@/services/licitacionAiService';

interface Props {
  open: boolean;
  onClose: () => void;
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

type Step = 'idle' | 'extracting' | 'text-ready' | 'analyzing' | 'review' | 'error';

export function DbcAnalyzerDialog({ open, onClose, licitacion, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]         = useState<Step>('idle');
  const [fileName, setFileName] = useState('');
  const [dbcText, setDbcText]   = useState('');
  const [result, setResult]     = useState<DbcExtraccion | null>(null);
  const [errMsg, setErrMsg]     = useState('');
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStep('idle');
    setFileName('');
    setDbcText('');
    setResult(null);
    setErrMsg('');
    setApplying(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Procesar archivo ─────────────────────────────────────────────────────────

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf  = name.endsWith('.pdf');
    const isDocx = name.endsWith('.docx') || name.endsWith('.doc');

    if (!isPdf && !isDocx) {
      toast.error('Solo se admiten archivos PDF o Word (.docx)');
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
      let extracted = '';
      if (isPdf)  extracted = await extractTextFromPdf(file);
      if (isDocx) extracted = await extractTextFromDocx(file);

      if (extracted.length >= 100) {
        // Extracción exitosa — mostrar el texto para que el usuario lo revise/edite
        setDbcText(extracted);
        setStep('text-ready');
      } else {
        // No se pudo extraer (PDF comprimido o escaneado)
        setDbcText('');
        setStep('idle');
        if (isPdf) {
          setErrMsg(
            'No se pudo extraer texto del PDF (puede estar comprimido o escaneado). ' +
            'Abre el PDF, selecciona todo el texto (Ctrl+A), cópialo y pégalo en el área de abajo.'
          );
        } else {
          setErrMsg('No se pudo leer el archivo Word. Intenta con otro formato o pega el texto manualmente.');
        }
      }
    } catch (err: any) {
      setErrMsg(err.message || 'Error al leer el archivo');
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

  // ── Análisis con Groq ────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (!dbcText.trim()) { toast.error('No hay texto para analizar'); return; }
    setStep('analyzing');
    try {
      const ext = await analizarDbc(dbcText.trim());
      setResult(ext);
      setStep('review');
    } catch (err: any) {
      setErrMsg(err.message || 'Error al analizar');
      setStep('error');
    }
  };

  // ── Aplicar resultados ───────────────────────────────────────────────────────

  const handleApply = async () => {
    if (!result) return;
    try {
      setApplying(true);
      const changes: Partial<Licitacion> = {};

      if (result.fecha_presentacion)        changes.fecha_presentacion     = result.fecha_presentacion;
      if (result.fecha_adjudicacion_est)    changes.fecha_adjudicacion_est = result.fecha_adjudicacion_est;
      if (result.fecha_contrato)            changes.fecha_contrato         = result.fecha_contrato;
      if (result.plazo_entrega_dias != null) changes.plazo_entrega_dias    = result.plazo_entrega_dias;
      if (result.precio_referencial  != null) changes.precio_referencial   = result.precio_referencial;

      if (result.requisitos_adicionales) {
        const prev = licitacion.notas?.trim() || '';
        const sep  = prev ? '\n\n---\n' : '';
        changes.notas = `${prev}${sep}📋 REQUISITOS ADICIONALES (extraído por IA):\n${result.requisitos_adicionales}`;
      }

      await LicitacionStorage.update(licitacion.id, changes);
      onUpdated({ ...licitacion, ...changes });
      toast.success('Datos aplicados a la licitación');
      handleClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setApplying(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasData = result && (
    result.fecha_presentacion || result.fecha_adjudicacion_est ||
    result.fecha_contrato || result.plazo_entrega_dias != null ||
    result.precio_referencial != null || result.requisitos_adicionales
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Analizar DBC con IA
          </DialogTitle>
          <DialogDescription>
            Sube el DBC en PDF o Word, o pega el texto directamente.
            El agente extrae fechas y requisitos automáticamente.
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
                    <span className="text-xs text-muted-foreground">— texto extraído</span>
                  </div>
                ) : (
                  <p className="text-sm font-medium">
                    {dragging ? 'Suelta aquí' : 'Arrastra el DBC o haz clic'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">PDF o Word (.docx) · máx. 15 MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileInput} />
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
                  ? 'Texto extraído — puedes editar antes de analizar:'
                  : 'O pega el texto del DBC directamente aquí:'}
              </label>
              <Textarea
                placeholder="Pega aquí el contenido del DBC copiado desde el PDF o Word…"
                value={dbcText}
                onChange={e => setDbcText(e.target.value)}
                rows={8}
                className="text-xs font-mono resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {dbcText.length.toLocaleString()} caracteres
                {dbcText.length > 16000 && (
                  <span className="text-amber-500 ml-1">(se usarán los primeros 16 000)</span>
                )}
              </p>
            </div>

            <Button
              className="w-full gap-2"
              disabled={!dbcText.trim()}
              onClick={runAnalysis}
            >
              <Sparkles className="h-4 w-4" />
              Analizar con IA
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
              <p className="font-semibold">El agente está analizando el DBC…</p>
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
              <span className="font-medium text-green-700 dark:text-green-400">Análisis completado</span>
              {fileName && (
                <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />{fileName}
                </span>
              )}
            </div>

            {/* Tabla de datos extraídos */}
            <div className="rounded-lg border divide-y">
              <Row label="Fecha presentación"   value={result.fecha_presentacion}     isDate />
              <Row label="Fecha adjudicación"   value={result.fecha_adjudicacion_est}  isDate />
              <Row label="Fecha contrato / OC"  value={result.fecha_contrato}          isDate />
              <Row
                label="Plazo de entrega"
                value={result.plazo_entrega_dias != null ? `${result.plazo_entrega_dias} días` : null}
              />
              <Row
                label="Precio referencial"
                value={result.precio_referencial != null
                  ? `Bs ${result.precio_referencial.toLocaleString('es-BO', { minimumFractionDigits: 2 })}`
                  : null}
              />
            </div>

            {/* Requisitos adicionales */}
            {result.requisitos_adicionales && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5" />
                  Requisitos adicionales detectados
                </p>
                <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-xs whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                  {result.requisitos_adicionales}
                </div>
                <p className="text-[11px] text-muted-foreground">Se añadirán a las Notas del proceso.</p>
              </div>
            )}

            {!hasData && (
              <p className="text-sm text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
                No se encontraron datos estructurados en el texto.<br />
                <span className="text-xs">Verifica que el texto sea del DBC correcto.</span>
              </p>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep('text-ready')} className="flex-1">
                <X className="h-3.5 w-3.5 mr-1.5" /> Editar texto
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying || !hasData}
                className="flex-1 gap-2"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {applying ? 'Aplicando…' : 'Aplicar datos'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Fila de resultado ─────────────────────────────────────────────────────────

function Row({ label, value, isDate }: {
  label: string;
  value: string | null | undefined;
  isDate?: boolean;
}) {
  let display = value;
  if (isDate && value) {
    try {
      display = new Date(value + 'T12:00:00').toLocaleDateString('es-BO', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
    } catch { /* mantener */ }
  }
  return (
    <div className="flex items-center justify-between px-3 py-2.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {display
        ? <span className="text-xs font-medium text-right">{display}</span>
        : <span className="text-xs text-muted-foreground/40 italic">No encontrado</span>
      }
    </div>
  );
}
