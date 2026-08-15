import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Секреты приходят заголовком x-worker-env: в Deno.env самохостового
  // рантайма их нет. Разбираем до всего остального — нужны и для проверки
  // входа, и для запроса к Gemini.
  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }

  try {
    // Запрос к Gemini платный, поэтому пускаем только вошедших. Без этой
    // проверки любой, кто знает адрес, тратил бы наш ключ.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || workerEnv["SUPABASE_URL"]!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || workerEnv["SUPABASE_SERVICE_ROLE_KEY"]!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image, style } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Прямой Google Gemini API (OpenAI-совместимый endpoint), ключ — свой.
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || workerEnv["GEMINI_API_KEY"];
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Ты помощник для социальной сети. Посмотри на фото и предложи короткий, живой текст для поста на русском языке (1-3 предложения). Без хештегов, без эмодзи в начале. Пиши естественно, как будто это пишет обычный человек. Только текст, ничего лишнего.${style ? ` ${style}` : ""}`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Предложи подпись к этому фото для поста:",
                },
                {
                  type: "image_url",
                  image_url: { url: image },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Слишком много запросов, попробуйте позже" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Недостаточно средств для AI" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const caption = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("subflow-ai-caption error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
