// Zona para arrastrar o elegir el archivo de la factura, con lectura asistida
// por IA. Se usa tanto en el alta manual del libro como en el pop-up del Libro
// Diario, para que el flujo sea idéntico en ambos sitios.
//
// El archivo NO se sube aquí: se guarda en memoria y lo sube el formulario
// después de crear la fila, porque la ruta del bucket necesita el id del
// documento. Lo único que ocurre aquí es leerlo para precargar los campos.
import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Sparkles, FileText, X, AlertTriangle, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MAX_ARCHIVO_BYTES, MIMES_ACEPTADOS, extraerDatosDeFactura,
  type FacturaExtraida,
} from '@/domain/taxes/facturaAiService';
import type { TaxDocTipo } from '@/domain/taxes';

interface Props {
  tipo: TaxDocTipo;
  /** Archivo elegido (aún sin subir). */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Se llama con los campos detectados para que el formulario se precargue. */
  onExtraido: (datos: FacturaExtraida) => void;
  /** Nombre del archivo ya adjunto en la base, cuando se está editando. */
  archivoExistente?: string | null;
  disabled?: boolean;
}

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FacturaUploader({
  tipo, file, onFileChange, onExtraido, archivoExistente, disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const soloAdjuntarRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [ultimaLectura, setUltimaLectura] = useState<FacturaExtraida | null>(null);

  function validar(f: File): boolean {
    if (!MIMES_ACEPTADOS.includes(f.type)) {
      toast.error('Formato no soportado. Adjunta un PDF o una imagen (JPG, PNG o WEBP).');
      return false;
    }
    if (f.size > MAX_ARCHIVO_BYTES) {
      toast.error('El archivo supera los 20 MB.');
      return false;
    }
    return true;
  }

  /**
   * Al elegir el archivo se lee de inmediato, que es lo que el usuario espera.
   * `soloAdjuntar` salta el análisis: sirve para guardar el respaldo de una
   * factura que ya se cargó a mano, sin gastar una llamada a la IA.
   */
  async function aceptar(f: File, soloAdjuntar = false) {
    if (!validar(f)) return;
    onFileChange(f);
    setUltimaLectura(null);
    if (soloAdjuntar) {
      toast.success('Archivo adjunto. Se guardará al registrar.');
      return;
    }
    await leer(f);
  }

  async function leer(f: File) {
    setLeyendo(true);
    try {
      const datos = await extraerDatosDeFactura(f, tipo);
      setUltimaLectura(datos);
      onExtraido(datos);
      toast.success(
        datos.via === 'texto'
          ? 'Factura leída. Revisa los datos antes de registrar.'
          : 'Factura leída desde la imagen. Revisa bien los importes.',
      );
    } catch (e: unknown) {
      // Que falle la lectura no invalida el adjunto: se puede llenar a mano.
      toast.error(e instanceof Error ? e.message : 'No se pudo leer la factura');
    } finally {
      setLeyendo(false);
    }
  }

  function quitar() {
    onFileChange(null);
    setUltimaLectura(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={MIMES_ACEPTADOS.join(',')}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          const solo = soloAdjuntarRef.current;
          soloAdjuntarRef.current = false;
          if (f) aceptar(f, solo);
        }}
      />

      {file ? (
        <div className="rounded-md border p-3 flex items-center gap-3">
          <FileText className="w-5 h-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatoTamano(file.size)}
              {ultimaLectura && (
                <> · leída {ultimaLectura.via === 'texto' ? 'del texto del PDF' : 'de la imagen'}</>
              )}
            </p>
          </div>
          {ultimaLectura && (
            <Badge
              variant={ultimaLectura.confianza === 'alta' ? 'outline' : 'default'}
              className={cn(
                'text-xs shrink-0',
                ultimaLectura.confianza === 'alta' && 'text-green-700 border-green-300',
                ultimaLectura.confianza === 'media' && 'bg-amber-500 hover:bg-amber-600',
                ultimaLectura.confianza === 'baja' && 'bg-red-600 hover:bg-red-700',
              )}
            >
              Confianza {ultimaLectura.confianza}
            </Badge>
          )}
          <Button
            type="button" size="sm" variant="outline" className="shrink-0"
            onClick={() => leer(file)} disabled={leyendo || disabled}
          >
            {leyendo
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
            <span className="ml-1.5 hidden sm:inline">{ultimaLectura ? 'Releer' : 'Analizar'}</span>
          </Button>
          <Button
            type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0"
            onClick={quitar} disabled={leyendo || disabled} title="Quitar archivo"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || leyendo}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) aceptar(f);
          }}
          className={cn(
            'w-full rounded-md border border-dashed p-4 text-center transition-colors',
            'hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          {leyendo ? (
            <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Leyendo la factura...
            </span>
          ) : (
            <>
              <span className="flex items-center justify-center gap-2 text-sm font-medium">
                <Upload className="w-4 h-4" /> Arrastra la factura o haz clic para elegirla
              </span>
              <span className="block text-xs text-muted-foreground mt-1">
                PDF o imagen, hasta 20 MB. Se leen los datos automáticamente y el archivo queda guardado.
              </span>
            </>
          )}
        </button>
      )}

      {/* Para guardar el respaldo de algo ya cargado a mano, sin llamar a la IA. */}
      {!file && (
        <Button
          type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
          disabled={disabled || leyendo}
          onClick={() => { soloAdjuntarRef.current = true; inputRef.current?.click(); }}
        >
          <Paperclip className="w-3 h-3 mr-1.5" /> Solo adjuntar, sin analizar
        </Button>
      )}

      {archivoExistente && !file && (
        <p className="text-xs text-muted-foreground">
          Adjunto actual: <span className="font-medium">{archivoExistente}</span>. Si subes otro, lo reemplaza.
        </p>
      )}

      {ultimaLectura && ultimaLectura.confianza !== 'alta' && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-200">
            La lectura no fue del todo clara. Verifica el NIT, el Nº de factura y los importes
            contra el documento antes de registrar.
          </span>
        </div>
      )}
    </div>
  );
}
