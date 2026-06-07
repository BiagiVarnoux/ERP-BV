// src/services/aiService.ts
// Servicio de IA para generación automática de asientos contables — powered by Groq via Edge Function

import { Account } from '@/accounting/types';
import { todayISO } from '@/accounting/utils';
import { supabase } from '@/integrations/supabase/client';

export interface AIJournalLine {
  account_id: string;
  account_name: string;
  debit: number;
  credit: number;
  side_label: string;
}

export interface AIJournalSuggestion {
  date: string;
  memo: string;
  lines: AIJournalLine[];
  explanation: string;
}

export interface AIParseResult {
  suggestions: AIJournalSuggestion[];
  raw_interpretation: string;
}

function buildSystemPrompt(accounts: Account[]): string {
  const accountList = accounts
    .filter(a => a.is_active)
    .map(a => {
      const typeAbbr: Record<string, string> = {
        ACTIVO: 'A', PASIVO: 'P', PATRIMONIO: 'Pn', INGRESO: 'I', GASTO: 'G',
      };
      const abbr = typeAbbr[a.type] || a.type;
      const normalSide = a.normal_side === 'DEBE' ? 'aumenta en Debe' : 'aumenta en Haber';
      return `- ${a.id} | ${a.name} | Tipo: ${a.type} (${abbr}) | ${normalSide}`;
    })
    .join('\n');

  return `Eres un contador experto en Bolivia que genera asientos contables de partida doble.
El usuario te dará descripciones en lenguaje natural de transacciones (puede haber una o varias).
Tu tarea es interpretar cada transacción y generar el asiento contable correcto.

PLAN DE CUENTAS DISPONIBLE:
${accountList}

REGLAS CONTABLES:
- Todo asiento debe cuadrar: suma de Débitos = suma de Créditos
- Activos y Gastos aumentan en el DEBE (débito)
- Pasivos, Patrimonio e Ingresos aumentan en el HABER (crédito)
- Usa SOLO las cuentas del plan de cuentas listado arriba
- Si el usuario dice "banco", "efectivo", "pago", usa la cuenta de Banco MN o Caja MN según corresponda
- Para gastos sin especificar cuenta, usa "Gastos Generales"
- Para compras de activos/inventario usa la cuenta de Inventario o Activos según aplique
- "Ayer" = fecha de ayer, "hoy" = fecha de hoy, "hace X días" = calcula la fecha

FORMATO DE RESPUESTA: Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin bloques de código.

El JSON debe tener esta estructura exacta:
{
  "suggestions": [
    {
      "date": "YYYY-MM-DD",
      "memo": "Descripción breve del asiento",
      "lines": [
        {
          "account_id": "G.1",
          "account_name": "Gastos Generales",
          "debit": 50,
          "credit": 0,
          "side_label": "G+"
        },
        {
          "account_id": "A.1",
          "account_name": "Banco MN",
          "debit": 0,
          "credit": 50,
          "side_label": "A-"
        }
      ],
      "explanation": "Se registra el gasto pagado con banco"
    }
  ],
  "raw_interpretation": "Interpretación general de lo que el usuario describió"
}

Para side_label: usa el tipo de cuenta (A, P, Pn, I, G) seguido de + si aumenta o - si disminuye.
Ejemplos: A+ (activo sube), A- (activo baja), G+ (gasto sube), I+ (ingreso sube), P+ (pasivo sube)`;
}

export async function generateJournalEntries(
  userText: string,
  accounts: Account[]
): Promise<AIParseResult> {
  const today = todayISO();
  const [ty, tm, td] = today.split('-').map(Number);
  const yDate = new Date(ty, tm - 1, td - 1);
  const yesterdayISO = `${yDate.getFullYear()}-${String(yDate.getMonth()+1).padStart(2,'0')}-${String(yDate.getDate()).padStart(2,'0')}`;

  const { data, error } = await supabase.functions.invoke('ai-journal', {
    body: {
      systemPrompt: buildSystemPrompt(accounts),
      userPrompt: `Hoy es ${today} (ayer fue ${yesterdayISO}).\n\nGenera los asientos contables para las siguientes transacciones:\n\n${userText}`,
    },
  });

  if (error) {
    throw new Error(error.message || 'Error al llamar al servicio de IA');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const rawText: string = data?.choices?.[0]?.message?.content ?? '';

  if (!rawText) {
    throw new Error('Groq no devolvió respuesta. Intenta de nuevo.');
  }

  const clean = rawText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  let parsed: AIParseResult;
  try {
    parsed = JSON.parse(clean) as AIParseResult;
  } catch {
    throw new Error('La IA devolvió una respuesta no válida. Intenta reformular tu descripción.');
  }

  // H10: Validate that all account_ids suggested by AI exist in the user's chart of accounts
  const validAccountIds = new Set(accounts.filter(a => a.is_active).map(a => a.id));
  for (const suggestion of parsed.suggestions ?? []) {
    for (const line of suggestion.lines ?? []) {
      if (!validAccountIds.has(line.account_id)) {
        throw new Error(
          `La IA sugirió una cuenta inválida: "${line.account_id}". Por favor intenta de nuevo o reformula la descripción.`
        );
      }
    }
  }

  return parsed;
}
