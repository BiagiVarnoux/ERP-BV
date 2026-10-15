// supabase/functions/ai-dbc/index.ts  v7
// Extrae el CRONOGRAMA DE PLAZOS de un DBC boliviano (SICOES) usando Groq.
// Es el RESPALDO: el cliente parsea primero en código y solo llama aquí cuando
// la plantilla no se reconoce. Recibe ya la ventana del cronograma (no el DBC
// completo). verify_jwt: true — la gateway de Supabase valida el JWT antes de llegar aquí.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres un asistente para licitaciones públicas bolivianas (SICOES/ANPE).
Recibes el texto de la tabla "Cronograma de Plazos". Las columnas se separan con " | ".
Cada actividad ocupa normalmente DOS líneas: una con los RÓTULOS (número, nombre, "Día | Mes | Año" y a veces "Hora | Min.") y la siguiente con los VALORES (los dígitos y a veces texto de lugar).
Devuelve SOLO un objeto JSON con exactamente esta forma:
{
  "cronograma": [
    { "nro": número de actividad o null, "actividad": "nombre", "fecha": "YYYY-MM-DD o cadena vacía", "hora": "HH:MM o cadena vacía" }
  ]
}

Reglas:
- Rearma la fecha con los 3 primeros números de la línea de valores: "30 | 07 | 2026" => "2026-07-30".
- Si la actividad tiene "Hora | Min." en sus rótulos, los 2 números siguientes son la hora: "08 | 30" => "08:30"; si no tiene, deja "hora" "".
- Si una actividad dice "No corresponde" o no tiene números, deja "fecha" "" y "hora" "".
- "nro" es el número de la actividad si la fila lo trae; si no, null.
- Respeta el ORDEN de aparición e incluye TODAS las actividades de la tabla.
- NO inventes datos. Si no encuentras la tabla del cronograma, devuelve { "cronograma": [] }.
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
        temperature:     0,
        max_tokens:      2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `Fragmento del DBC con el Cronograma de Plazos:\n\n${sanitized}` },
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
