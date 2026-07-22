import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LANG_CONFIG: Record<string, { from: string; to: string; systemPrompt: string }> = {
  kz: { from: 'русского', to: 'казахский', systemPrompt: 'Ты профессиональный переводчик с русского на казахский язык. Переводи точно и естественно.' },
  en: { from: 'Russian', to: 'English', systemPrompt: 'You are a professional translator from Russian to English. Translate accurately and naturally.' },
  uz: { from: 'русского', to: 'узбекский (латиница)', systemPrompt: 'Siz professional tarjimon. Rus tilidan o\'zbek tiliga (lotin alifbosida) aniq va tabiiy tarjima qiling.' },
  kg: { from: 'русского', to: 'кыргызский', systemPrompt: 'Сиз орус тилинен кыргыз тилине которуучу профессионал котормочусуз. Так жана табигый которуңуз.' },
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

    const lang = targetLang || 'kz';
    const config = LANG_CONFIG[lang] || LANG_CONFIG.kz;
    const batch = texts.slice(0, 20);
    const numberedTexts = batch.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');

    const prompt = lang === 'en'
      ? `Translate the following texts from Russian to English. Return ONLY translated texts, one per line, with numbers. Preserve formatting, emojis and special characters. Don't add anything extra.\n\n${numberedTexts}`
      : `Переведи следующие тексты с ${config.from} на ${config.to} язык. Верни ТОЛЬКО переведённые тексты, по одному на строку, с номерами. Сохрани форматирование, эмодзи и специальные символы. Не добавляй ничего лишнего.\n\n${numberedTexts}`;

    // Прямой Google Gemini API (OpenAI-совместимый endpoint), ключ — свой.
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || workerEnv["GEMINI_API_KEY"];
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Порядок моделей (актуально для текущего free-tier ключа):
    //  • gemini-2.0-flash-lite — БЕЗ «thinking», стабильно отдаёт контент, хорошо
    //    переводит и не галлюцинирует (в отличие от снятой 2.5-flash-lite);
    //  • gemini-flash-lite-latest / gemini-flash-latest — запас, если у lite
    //    кончится минутная квота. (Пиннованные 2.5-flash / 2.5-flash-lite новым
    //    ключам отдают 404 «no longer available to new users».)
    // Если ВСЕ модели упадут (429/пусто) — функция вернёт 500, а автоперевод (TT)
    // на клиенте покажет русский как есть (безопасный фолбэк, не мусор).
    const MODELS = ["gemini-2.0-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"];

    const parseTranslations = (content: string): string[] | null => {
      const lines = content.split('\n').filter((l: string) => l.trim());
      const out: string[] = [];
      let matched = 0;
      for (let i = 0; i < batch.length; i++) {
        const linePrefix = `${i + 1}.`;
        const matchedLine = lines.find((l: string) => l.trim().startsWith(linePrefix));
        if (matchedLine) {
          out.push(matchedLine.trim().substring(linePrefix.length).trim());
          matched++;
        } else if (lines[i]) {
          const cleaned = lines[i].replace(/^\d+\.\s*/, '').trim();
          out.push(cleaned || batch[i]);
        } else {
          out.push(batch[i]);
        }
      }
      // Строгая валидация: модель обязана вернуть нумерованную строку для КАЖДОГО
      // текста — иначе ответ подозрительный (перегруженные модели галлюцинируют),
      // пробуем следующую модель.
      if (matched < batch.length) return null;
      return out;
    };

    const callModel = async (model: string): Promise<{ ok: boolean; status?: number; content?: string }> => {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      });
      if (!response.ok) return { ok: false, status: response.status };
      const data = await response.json();
      return { ok: true, content: data.choices?.[0]?.message?.content || '' };
    };

    let translations: string[] | null = null;
    let lastError = '';

    for (const model of MODELS) {
      try {
        let res = await callModel(model);
        // 503 = временный всплеск нагрузки: одна быстрая повторная попытка.
        if (!res.ok && res.status === 503) {
          await new Promise((r) => setTimeout(r, 700));
          res = await callModel(model);
        }
        if (!res.ok) {
          lastError = `${model}: HTTP ${res.status}`;
          continue;
        }
        const parsed = parseTranslations(res.content || '');
        if (parsed) {
          translations = parsed;
          break;
        }
        lastError = `${model}: unparseable response`;
      } catch (e) {
        lastError = `${model}: ${e?.message || e}`;
      }
    }

    if (!translations) {
      throw new Error(`All models failed. Last: ${lastError}`);
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
