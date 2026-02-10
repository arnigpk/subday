import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_PROMPT = `Ты — дружелюбный AI-ассистент приложения subday. Отвечай конкретно и точно. Если у тебя есть данные — давай их сразу, не перенаправляй пользователя в разделы приложения. Отвечай кратко, по делу, на русском языке. Используй эмодзи умеренно.

О приложении subday:
subday — сервис подписок на кофе и напитки. Пользователи покупают подписку и получают напитки в кофейнях-партнёрах.

Разделы приложения:
🏠 Главная — баланс оставшихся напитков, ближайшие кофейни, рекламные баннеры, быстрые действия.
☕ Подписки — два типа: "Кофе" (только кофейные напитки) и "Напитки" (любые напитки включая кофе).
🏪 Кофейни — список кофеен-партнёров с адресами, часами работы, расстоянием и галереей фото.
📱 QR-код — чтобы получить напиток: открой «Получить кофе» → покажи QR-код бариста → напиток спишется.
🔥 Стрики — за ежедневное получение напитков копится серия (streak). Чем длиннее серия, тем больше бонусов.
🎁 Бонусы — бонусные баллы за активность.
📰 subFlow — лента новостей от кофеен с реакциями и комментариями.
👤 Профиль — настройки: имя, аватар, город, тема, уведомления, техподдержка.
📊 История — история всех полученных напитков.

Навигация: внизу 5 вкладок — Главная, Подписки, QR-код, subFlow, Профиль.

Техподдержка: для связи с поддержкой перейди в Профиль → Техподдержка. Также можно написать в Telegram.

ВАЖНО: Если пользователь спрашивает цены, подписки, кофейни — давай конкретные данные из раздела ниже. НЕ говори «посмотрите в разделе» — дай ответ сразу.
Если пользователь спрашивает что-то не связанное с приложением, вежливо направь его к функциям subday.`;

async function fetchAppData() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const [shopsRes, subsRes] = await Promise.all([
    sb.from("shops").select("name, address, addresses, working_hours, city").eq("is_active", true).order("sort_order"),
    sb.from("subscription_types").select("name, type, price, cups_count, daily_limit, duration_days, features, description").eq("is_active", true).order("sort_order"),
  ]);

  let dataBlock = "\n\n--- АКТУАЛЬНЫЕ ДАННЫЕ ПРИЛОЖЕНИЯ ---\n";

  if (subsRes.data?.length) {
    dataBlock += "\n📋 ПОДПИСКИ И ЦЕНЫ:\n";
    for (const s of subsRes.data) {
      dataBlock += `• "${s.name}" (тип: ${s.type}) — ${s.price} ₸, ${s.cups_count} напитков, лимит ${s.daily_limit || 1}/день, срок ${s.duration_days || '?'} дней`;
      if (s.description) dataBlock += `. ${s.description}`;
      if (s.features?.length) dataBlock += `. Включает: ${s.features.join(", ")}`;
      dataBlock += "\n";
    }
  }

  if (shopsRes.data?.length) {
    dataBlock += "\n☕ КОФЕЙНИ-ПАРТНЁРЫ:\n";
    for (const sh of shopsRes.data) {
      const addrs = sh.addresses?.length ? sh.addresses.join("; ") : sh.address || "адрес не указан";
      dataBlock += `• ${sh.name}${sh.city ? ` (${sh.city})` : ""} — ${addrs}`;
      if (sh.working_hours) dataBlock += `, часы работы: ${sh.working_hours}`;
      dataBlock += "\n";
    }
  }

  return dataBlock;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch real app data for context
    let appData = "";
    try { appData = await fetchAppData(); } catch (e) { console.error("Failed to fetch app data:", e); }

    const systemPrompt = BASE_PROMPT + appData;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Лимит AI-запросов исчерпан." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Ошибка AI-сервиса" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
