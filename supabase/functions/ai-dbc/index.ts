// supabase/functions/ai-dbc/index.ts  v6
// Extrae datos estructurados de un DBC boliviano (SICOES) usando Groq.
// verify_jwt: true — la gateway de Supabase valida el JWT antes de llegar aquí.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres un asistente para licitaciones públicas bolivianas (SICOES/ANPE).
Extrae del texto del DBC los siguientes datos y devuelve SOLO un objeto JSON con exactamente estos campos (usa null si no encuentras el dato):
{
  "fecha_presentacion":    "YYYY-MM-DD o null",
  "fecha_adjudicacion_est":"YYYY-MM-DD o null",
  "fecha_contrato":        "YYYY-MM-DD o null",
  "plazo_entrega_dias":    número entero o null,
  "precio_referencial":    número sin puntos de miles y con punto decimal o null,
  "requisitos_adicionales":"texto con requisitos ADICIONALES como experiencia mínima, representaciones, certificaciones, sede física, etc. Si no hay, null"
}

Reglas:
- Las fechas en el cronograma de un DBC boliviano suelen aparecer como dígitos separados por espacios porque cada celda de la tabla Word es un elemento separado. Ejemplo: "09 0 6 2026" = 09/06/2026 = 2026-06-09. Interpreta siempre en formato DD MM YYYY.
- La actividad #5 del cronograma suele ser la fecha de presentación de propuestas.
- La actividad #10 suele ser la adjudicación estimada.
- La actividad #13 suele ser la firma del contrato.
- El precio referencial está en bolivianos (Bs) y puede estar en la sección de datos generales o en la tabla de ítems.
- El plazo de entrega es en días hábiles o calendario, para entregar bienes tras firmar el contrato.
- NO incluyas especificaciones técnicas de productos en requisitos_adicionales.
- Responde SOLO con el JSON, sin explicaciones adicionales.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body    = await req.json();
    const dbcText = (body.dbcText ?? "").trim();

    if (!dbcText) return json({ error: "Se requiere dbcText" }, 400);

    const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_KEY) return json({ error: "GROQ_API_KEY no configurado en Supabase secrets" }, 500);

    // Sanitizar: eliminar caracteres de control que podrían romper el JSON enviado a Groq
    const sanitized = dbcText
      .slice(0, 12_000)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:           "llama-3.1-8b-instant",
        temperature:     0.05,
        max_tokens:      600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `PARTE II del DBC:\n\n${sanitized}` },
        ],
      }),
    });

    // Devolver el error exacto de Groq para facilitar el diagnóstico
    const groqBody = await resp.text();
    if (!resp.ok) {
      console.error("Groq error:", resp.status, groqBody);
      return json({
        error:      `Groq devolvió status ${resp.status}`,
        groq_error: groqBody.slice(0, 500),
      }, 502);
    }

    const groqData = JSON.parse(groqBody);
    const rawText  = groqData?.choices?.[0]?.message?.content ?? "";
    const clean    = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const extraction = JSON.parse(clean);
      return json({ extraction }, 200);
    } catch {
      console.error("JSON parse failed:", clean.slice(0, 200));
      return json({ error: "JSON inválido del modelo", raw: clean.slice(0, 200) }, 500);
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ai-dbc error:", msg);
    return json({ error: "Error interno", detail: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
