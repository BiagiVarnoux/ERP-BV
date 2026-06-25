// Servicio de IA para clasificación automática de cuentas del plan de cuentas.
// Reutiliza el edge function ai-journal (que solo reenvía prompt + response a Groq).

import { supabase } from '@/integrations/supabase/client';
import type {
  AccountType, ClasificacionResultado, SubclasificacionResultado, ClasificacionFlujo,
} from '@/accounting/types';

export interface AccountClassificationSuggestion {
  suggested_name: string;
  type: AccountType;
  normal_side: 'DEBE' | 'HABER';
  is_current: boolean | null;           // null = no aplica (no es ACTIVO/PASIVO)
  is_cash_equivalent: boolean;
  clasificacion_resultado: ClasificacionResultado | null;
  subclasificacion_resultado: SubclasificacionResultado | null;
  clasificacion_flujo: ClasificacionFlujo;
  es_partida_no_monetaria: boolean;
  es_capital_trabajo: boolean;
  es_financiera: boolean;
  es_extraordinaria: boolean;
  afecta_ebitda: boolean;
  explanation: string;
}

const SYSTEM_PROMPT = `Eres un contador experto en Bolivia que clasifica cuentas contables según los estándares bolivianos (NIF Bolivia / NIIF).
El usuario te describirá una cuenta que quiere crear. Tu tarea es sugerir la clasificación completa según los parámetros del sistema.

PARÁMETROS DEL SISTEMA (valores exactos que debes usar):

1. type (tipo de cuenta):
   - "ACTIVO": bienes y derechos que posee la empresa (caja, bancos, inventario, cuentas por cobrar, activos fijos, etc.)
   - "PASIVO": obligaciones con terceros (deudas, préstamos recibidos, cuentas por pagar, impuestos por pagar, etc.)
   - "PATRIMONIO": capital propio (capital, reservas, resultados acumulados, etc.)
   - "INGRESO": ingresos generados (ventas, ingresos financieros, etc.)
   - "GASTO": erogaciones (costo de ventas, gastos operativos, gastos financieros, impuestos, etc.)

2. normal_side (lado normal de la cuenta):
   - "DEBE": para ACTIVO y GASTO (aumentan con débito)
   - "HABER": para PASIVO, PATRIMONIO e INGRESO (aumentan con crédito)

3. is_current (corriente o no corriente — SOLO para ACTIVO y PASIVO, null para el resto):
   - true: corriente (se convierte en efectivo o se paga en ≤ 12 meses). Ej: caja, CxC clientes, inventario, CxP proveedores
   - false: no corriente (plazo > 12 meses). Ej: activos fijos, préstamos L/P, inversiones L/P
   - null: no aplica (para INGRESO, GASTO, PATRIMONIO)

4. clasificacion_resultado (SOLO para INGRESO y GASTO, null para el resto):
   Para INGRESO:
   - "ingreso_operativo": ingresos del giro principal del negocio (ventas de productos/servicios)
   - "ingreso_no_operativo": ingresos fuera del giro (intereses ganados, diferencial cambiario positivo, etc.)
   Para GASTO:
   - "costo_ventas": costo directo de lo vendido (costo de mercadería, producción, servicios prestados)
   - "gasto_operativo": gastos de operación normales (sueldos, alquileres, servicios, depreciación, etc.)
   - "gasto_no_operativo": gastos fuera del giro (intereses pagados, comisiones bancarias, pérdidas cambiarias)
   - "impuesto": IT, IVA, IUE y otros impuestos

5. subclasificacion_resultado (solo cuando hay clasificacion_resultado, null si no aplica):
   Para ingreso_operativo: "ventas" | "devoluciones" | "otros_ingresos_operativos"
   Para ingreso_no_operativo: "intereses" | "diferencial_cambiario" | "otro"
   Para costo_ventas: "costo_mercaderia" | "costo_produccion" | "costo_servicios" | "otro"
   Para gasto_operativo: "administrativos" | "ventas_marketing" | "logistica" | "depreciacion" | "amortizacion" | "otro"
   Para gasto_no_operativo: "intereses" | "comisiones_bancarias" | "diferencial_cambiario" | "otro"
   Para impuesto: "otro"

6. clasificacion_flujo (SOLO para ACTIVO, PASIVO y PATRIMONIO, usar "no_aplica" para INGRESO y GASTO):
   - "operacion": relacionado con el ciclo operativo normal (caja, inventario, CxC operativas, CxP proveedores)
   - "inversion": activos a largo plazo y sus financiamientos (activos fijos, inversiones en otras empresas)
   - "financiamiento": préstamos, emisión de capital, dividendos (deudas bancarias, capital, resultados acumulados)
   - "no_aplica": para INGRESO y GASTO

7. is_cash_equivalent (SOLO para ACTIVO, false para el resto):
   - true: efectivo o equivalente (caja, bancos, inversiones a muy corto plazo convertibles en efectivo)
   - false: no es efectivo ni equivalente

8. Propiedades financieras avanzadas (boolean):
   - es_partida_no_monetaria: true si es depreciación, amortización, provisión, o ajuste no cash
   - es_capital_trabajo: true si es activo o pasivo corriente operativo (inventario, CxC, CxP proveedores, etc.)
   - es_financiera: true si es deuda bancaria, préstamo, inversión financiera, o instrumento financiero
   - es_extraordinaria: true si es resultado extraordinario o no recurrente
   - afecta_ebitda: true para ingresos operativos y gastos operativos (antes de depreciación e intereses)
     false para: intereses, impuestos, depreciación, amortización, diferencial cambiario

REGLAS DE CONSISTENCIA:
- Si type="GASTO" y clasificacion_resultado="costo_ventas" → es_capital_trabajo=false, afecta_ebitda=true
- Si type="GASTO" y subclasificacion_resultado="depreciacion" → es_partida_no_monetaria=true, afecta_ebitda=false
- Si type="GASTO" y clasificacion_resultado="gasto_no_operativo" → afecta_ebitda=false
- Si type="ACTIVO" y is_cash_equivalent=true → is_current=true, clasificacion_flujo="operacion"
- Si type="ACTIVO" y is_current=false → es_capital_trabajo=false
- Si clasificacion_resultado="impuesto" → afecta_ebitda=false

FORMATO DE RESPUESTA: Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown.

{
  "suggested_name": "nombre sugerido para la cuenta en español (conciso, estilo plan de cuentas)",
  "type": "ACTIVO",
  "normal_side": "DEBE",
  "is_current": true,
  "is_cash_equivalent": false,
  "clasificacion_resultado": null,
  "subclasificacion_resultado": null,
  "clasificacion_flujo": "operacion",
  "es_partida_no_monetaria": false,
  "es_capital_trabajo": true,
  "es_financiera": false,
  "es_extraordinaria": false,
  "afecta_ebitda": true,
  "explanation": "Explicación breve en español del por qué de cada clasificación"
}`;

export async function suggestAccountClassification(
  description: string,
): Promise<AccountClassificationSuggestion> {
  const userPrompt = `Clasifica esta cuenta contable: "${description.trim()}"`;

  const { data, error } = await supabase.functions.invoke('ai-journal', {
    body: { systemPrompt: SYSTEM_PROMPT, userPrompt },
  });

  if (error) throw new Error(error.message || 'Error al llamar al servicio de IA');
  if (data?.error) throw new Error(data.error);

  const rawText: string = data?.choices?.[0]?.message?.content ?? '';
  if (!rawText) throw new Error('Groq no devolvió respuesta. Intenta de nuevo.');

  const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: AccountClassificationSuggestion;
  try {
    parsed = JSON.parse(clean) as AccountClassificationSuggestion;
  } catch {
    throw new Error('La IA devolvió una respuesta no válida. Intenta reformular tu descripción.');
  }

  return parsed;
}
