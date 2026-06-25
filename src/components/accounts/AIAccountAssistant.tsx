// Asistente IA para clasificación de cuentas del plan de cuentas.
// El usuario describe la cuenta en lenguaje natural y la IA sugiere todos los campos de clasificación.

import React, { useState, useRef } from 'react';
import { Sparkles, Send, ChevronDown, ChevronUp, RotateCcw, Loader2, Lightbulb, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CLASIFICACION_RESULTADO_LABELS,
  CLASIFICACION_FLUJO_LABELS,
  SUBCLASIFICACION_RESULTADO_LABELS,
} from '@/accounting/types';
import {
  suggestAccountClassification,
  type AccountClassificationSuggestion,
} from '@/services/accountAiService';

interface AIAccountAssistantProps {
  onApplySuggestion: (suggestion: AccountClassificationSuggestion) => void;
}

const EXAMPLES = [
  'Cuenta por cobrar a largo plazo',
  'Depreciación acumulada de equipos',
  'Préstamo bancario a 5 años',
  'Ingresos por intereses de inversiones',
  'Impuesto a las transacciones (IT)',
  'Reserva legal',
];

function SuggestionRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground min-w-[160px] shrink-0">{label}</span>
      <span className="font-medium text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value
    ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-[11px]">{trueLabel ?? 'Sí'}</Badge>
    : <Badge variant="outline" className="text-muted-foreground text-[11px]">{falseLabel ?? 'No'}</Badge>;
}

export function AIAccountAssistant({ onApplySuggestion }: AIAccountAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AccountClassificationSuggestion | null>(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    if (!inputText.trim()) {
      toast.error('Describí la cuenta que querés crear');
      return;
    }
    setIsLoading(true);
    setResult(null);
    setApplied(false);
    try {
      const suggestion = await suggestAccountClassification(inputText);
      setResult(suggestion);
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar con IA');
    } finally {
      setIsLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    onApplySuggestion(result);
    setApplied(true);
    toast.success(`Clasificación aplicada — revisá y ajustá si es necesario`);
  }

  function handleReset() {
    setResult(null);
    setInputText('');
    setApplied(false);
  }

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/80 to-purple-50/40 dark:from-violet-950/30 dark:to-purple-950/20 shadow-sm overflow-hidden">
      {/* Header / toggle */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-violet-900 dark:text-violet-100 text-sm">
            Asistente IA — Clasificar cuenta
          </span>
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-0 text-[10px] font-semibold uppercase tracking-wide">
            Beta
          </Badge>
        </div>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-violet-400" />
          : <ChevronDown className="w-4 h-4 text-violet-400" />
        }
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-5 pb-5 pt-2 space-y-4 border-t border-violet-200/60 dark:border-violet-800/40">

          {/* Input */}
          {!result && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-violet-700 dark:text-violet-300">
                  Describí la cuenta en lenguaje natural
                </label>
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Ej: Cuenta por cobrar a largo plazo, préstamo bancario a 5 años…"
                    className="bg-white dark:bg-gray-900 border-violet-200 dark:border-violet-700 focus-visible:ring-violet-400"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={isLoading || !inputText.trim()}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0 shadow-sm shrink-0"
                  >
                    {isLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Presioná Enter o el botón para clasificar. La IA sugerirá tipo, corriente/no corriente, flujo de efectivo y más.
                </p>
              </div>

              {/* Ejemplos */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lightbulb className="w-3 h-3" />
                  Ejemplos:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => { setInputText(ex); inputRef.current?.focus(); }}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="space-y-3">
              <div className={`rounded-lg border transition-all ${applied ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
                {/* Header tarjeta */}
                <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Nombre sugerido</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{result.suggested_name}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={applied ? 'outline' : 'default'}
                    disabled={applied}
                    onClick={handleApply}
                    className={!applied ? 'bg-violet-600 hover:bg-violet-700 text-white border-0 text-xs h-8' : 'text-xs h-8'}
                  >
                    {applied
                      ? <><Check className="w-3.5 h-3.5 mr-1" />Aplicado</>
                      : 'Aplicar al formulario'
                    }
                  </Button>
                </div>

                {/* Clasificaciones principales */}
                <div className="px-4 py-3 space-y-2 border-b border-gray-100 dark:border-gray-800">
                  <SuggestionRow label="Tipo de cuenta"
                    value={<Badge variant="outline" className="font-mono text-xs">{result.type}</Badge>} />
                  <SuggestionRow label="Lado normal"
                    value={<Badge variant="outline" className="font-mono text-xs">{result.normal_side}</Badge>} />

                  {result.is_current !== null && (
                    <SuggestionRow label="Corriente / No corriente"
                      value={result.is_current ? '✅ Corriente (≤12 meses)' : '📅 No corriente (>12 meses)'} />
                  )}

                  {result.is_cash_equivalent && (
                    <SuggestionRow label="Efectivo o equivalente"
                      value={<BoolBadge value={result.is_cash_equivalent} trueLabel="Sí" />} />
                  )}

                  {result.clasificacion_resultado && (
                    <SuggestionRow label="Clasificación resultado"
                      value={CLASIFICACION_RESULTADO_LABELS[result.clasificacion_resultado] ?? result.clasificacion_resultado} />
                  )}

                  {result.subclasificacion_resultado && (
                    <SuggestionRow label="Subclasificación"
                      value={(SUBCLASIFICACION_RESULTADO_LABELS as Record<string, string>)[result.subclasificacion_resultado] ?? result.subclasificacion_resultado} />
                  )}

                  {result.clasificacion_flujo && result.clasificacion_flujo !== 'no_aplica' && (
                    <SuggestionRow label="Flujo de efectivo"
                      value={CLASIFICACION_FLUJO_LABELS[result.clasificacion_flujo] ?? result.clasificacion_flujo} />
                  )}
                </div>

                {/* Propiedades avanzadas */}
                <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {result.es_partida_no_monetaria && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <BoolBadge value={result.es_partida_no_monetaria} trueLabel="No monetaria" />
                    </div>
                  )}
                  {result.es_capital_trabajo && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <BoolBadge value={result.es_capital_trabajo} trueLabel="Capital de trabajo" />
                    </div>
                  )}
                  {result.es_financiera && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <BoolBadge value={result.es_financiera} trueLabel="Financiera" />
                    </div>
                  )}
                  {result.es_extraordinaria && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <BoolBadge value={result.es_extraordinaria} trueLabel="Extraordinaria" />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Afecta EBITDA:</span>
                    <BoolBadge value={result.afecta_ebitda} />
                  </div>
                </div>

                {/* Explicación */}
                {result.explanation && (
                  <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-[11px] text-muted-foreground italic">
                      💡 {result.explanation}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Nueva consulta
                </Button>
                {applied && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Revisá y ajustá los campos del formulario si necesitás cambiar algo
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
