import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Ты — дружелюбный AI-ассистент приложения subday. Помогай пользователям разобраться с функциями. Отвечай кратко, по делу, на русском языке. Используй эмодзи умеренно.

О приложении subday:
subday — сервис подписок на кофе и напитки. Пользователи покупают подписку и получают напитки в кофейнях-партнёрах.

Разделы приложения:

🏠 **Главная** — баланс оставшихся напитков (кофе и/или другие напитки), ближайшие кофейни, рекламные баннеры, быстрые действия.

☕ **Подписки** — два типа: "Кофе" (только кофейные напитки) и "Напитки" (любые напитки включая кофе). У каждой подписки есть количество напитков, срок действия и дневной лимит. Оформление через кнопку "Оформить подписку".

🏪 **Кофейни** — список кофеен-партнёров с адресами, часами работы, расстоянием от пользователя и галереей фото. Можно посмотреть подробности каждой кофейни.

📱 **QR-код** — чтобы получить напиток, нужно открыть раздел "Получить кофе" (кнопка на главной или в навигации), там появится QR-код. Покажите его бариста, и он спишет напиток. Есть дневной лимит.

🔥 **Стрики** — система лояльности: за ежедневное получение напитков накапливается серия (streak). Чем длиннее серия, тем больше бонусов.

🎁 **Бонусы** — бонусные баллы за активность. Можно посмотреть историю начислений.

📰 **subFlow** — лента новостей от кофеен. Кофейни публикуют посты с фото, пользователи могут ставить реакции и комментировать.

👤 **Профиль** — настройки: имя, аватар, город, тема оформления (светлая/тёмная), уведомления, техподдержка, выход из аккаунта.

📊 **История** — история всех полученных напитков с датами и кофейнями.

Навигация: внизу экрана 5 вкладок — Главная, Подписки, QR-код (получить кофе), subFlow, Профиль.

Если пользователь спрашивает что-то не связанное с приложением, вежливо направь его к функциям subday.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Лимит AI-запросов исчерпан." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Ошибка AI-сервиса" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
