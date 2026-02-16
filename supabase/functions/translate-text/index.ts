import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texts, targetLang } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ translations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit batch size
    const batch = texts.slice(0, 20);

    const numberedTexts = batch.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');

    const prompt = `Переведи следующие тексты с русского на казахский язык. Верни ТОЛЬКО переведённые тексты, по одному на строку, с номерами. Сохрани форматирование, эмодзи и специальные символы. Не добавляй ничего лишнего.

${numberedTexts}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Ты профессиональный переводчик с русского на казахский язык. Переводи точно и естественно." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse numbered translations
    const lines = content.split('\n').filter((l: string) => l.trim());
    const translations: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      // Try to find line starting with number
      const linePrefix = `${i + 1}.`;
      const matchedLine = lines.find((l: string) => l.trim().startsWith(linePrefix));
      if (matchedLine) {
        translations.push(matchedLine.trim().substring(linePrefix.length).trim());
      } else if (lines[i]) {
        // Fallback: use line by index
        const cleaned = lines[i].replace(/^\d+\.\s*/, '').trim();
        translations.push(cleaned || batch[i]);
      } else {
        translations.push(batch[i]);
      }
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Translation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
