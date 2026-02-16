import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMMON_PROMPT = `
О приложении subday:
subday — сервис пакетов на кофе и напитки в Казахстане. Пользователи покупают пакет и получают напитки в кофейнях-партнёрах.

Оператор: ТОО "Subday Group", БИН 980102400093
Адрес: Республика Казахстан, Атырауская область, г. Атырау, мкр. Береке, д.23, кв.37
Контакты: supp@subday.app, +7 707 700 0994

Разделы приложения:
🏠 Главная — баланс оставшихся напитков, ближайшие кофейни, рекламные баннеры, быстрые действия.
☕ Пакеты — доступные пакеты напитков с ценами и условиями.
🏪 Кофейни — список кофеен-партнёров с адресами, часами работы, расстоянием и галереей фото.
📱 QR-код — чтобы получить напиток: нажми «Получить кофе» → покажи QR-код бариста → напиток спишется.
🔥 Стрики — за ежедневное получение напитков копится серия (streak). Чем длиннее серия, тем больше бонусов.
🎁 Бонусы — бонусные баллы за активность.
📰 subFlow — лента новостей от кофеен с реакциями и комментариями (доступна только активным подписчикам).
👤 Профиль — настройки: имя, аватар, город, тема, уведомления, техподдержка, правила сервиса.
📊 История — история всех полученных напитков.

Навигация: внизу 5 вкладок — Главная, Пакеты, QR-код (Получить кофе), subFlow, Профиль.

Панель управления (💻 на главной):
- Админка (для админов и модераторов): управление кофейнями, пакетами, пользователями, баннерами, рассылками, подписками, статистика.
- Кабинет партнёра (для партнёров и бариста): сканирование QR-кодов клиентов, история погашений, управление персоналом кофейни.

Техподдержка: для связи с поддержкой перейди в Профиль → Техподдержка. Также можно написать на supp@subday.app или в Telegram.

Оплата: производится через Kaspi.

Возвраты: возвраты по инициативе пользователя ("передумал/не успел") не предусмотрены. Обращения по ошибочным списаниям/сбоям: supp@subday.app.

Гостевой доступ: Пользователь может один раз в месяц предоставить третьему лицу (18+) гостевой доступ на 10 дней (1 кофе на 10 дней). При этом списывается 1 напиток из его активного пакета. Получатель может получить гостевой доступ только один раз за всё время. У получателя не должно быть истории подписок или транзакций в системе.

Что входит в "Любой кофе": любой кофейный напиток, доступный у Партнёра. Альтернативное молоко, сиропы и иные добавки — зависит от конкретного пакета (см. "Включает" в описании пакета).

ВАЖНО: 
- Если пользователь спрашивает цены, пакеты, кофейни — давай КОНКРЕТНЫЕ данные из раздела ниже. НЕ говори «посмотрите в разделе» — дай ответ сразу.
- Когда описываешь пакеты, ОБЯЗАТЕЛЬНО указывай ВСЕ пункты из поля "Включает" — это ключевая информация для пользователя.
- Если daily_limit не указан или указан как "безлимит" — это значит БЕЗЛИМИТ напитков в день (без ограничений по количеству в день).
- Если пользователь спрашивает что-то не связанное с приложением, вежливо направь его к функциям subday.
- Неиспользованные напитки по окончании срока пакета аннулируются, перенос остатков не допускается.`;

const BASE_PROMPT_RU = `Ты — дружелюбный AI-ассистент приложения subday (Служба заботы). Отвечай конкретно и точно. Если у тебя есть данные — давай их сразу, не перенаправляй пользователя в разделы приложения. Отвечай кратко, по делу, на русском языке. Используй эмодзи умеренно.` + COMMON_PROMPT;

const BASE_PROMPT_KZ = `Сен — subday қосымшасының мейірімді AI-көмекшісісің (Қамқорлық қызметі). Нақты және дәл жауап бер. Егер деректерің болса — бірден бер, пайдаланушыны қосымша бөлімдерге жібермe. Қысқа, нақты, қазақ тілінде жауап бер. Эмодзиді орынды қолдан.` + COMMON_PROMPT;

const getBasePrompt = (language: string) => language === 'kz' ? BASE_PROMPT_KZ : BASE_PROMPT_RU;

// Cache for app data — refreshes every 12 hours
let cachedAppData = "";
let cacheTimestamp = 0;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function fetchUserContext(supabaseUrl: string, supabaseKey: string, authHeader: string | null): Promise<string> {
  if (!authHeader) return "";
  
  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || supabaseKey;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return "";
    const user = { id: claimsData.claims.sub as string };

    const sb = createClient(supabaseUrl, supabaseKey);
    
    const [statsRes, subRes, profileRes] = await Promise.all([
      sb.from("user_stats").select("coffee_remaining, coffee_total, drinks_remaining, drinks_total, current_streak, max_streak, bonus_points, total_cups").eq("user_id", user.id).maybeSingle(),
      sb.from("user_subscriptions").select("subscription_type_id, started_at, expires_at, is_active, subscription_types(name, type, cups_count, daily_limit, duration_days, features)").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      sb.from("profiles").select("name, city").eq("user_id", user.id).maybeSingle(),
    ]);

    let ctx = "\n\n--- ПЕРСОНАЛЬНЫЕ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ---\n";
    
    if (profileRes.data) {
      ctx += `👤 Имя: ${profileRes.data.name || "не указано"}, Город: ${profileRes.data.city || "не указан"}\n`;
    }

    if (subRes.data && subRes.data.is_active) {
      const st = subRes.data.subscription_types as any;
      const expiresAt = subRes.data.expires_at ? new Date(subRes.data.expires_at) : null;
      const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : "?";
      ctx += `\n📦 Активный пакет: "${st?.name || "Неизвестный"}" (тип: ${st?.type || "?"})\n`;
      ctx += `  Осталось дней: ${daysLeft}\n`;
      if (st?.daily_limit) ctx += `  Дневной лимит: ${st.daily_limit}\n`;
      else ctx += `  Дневной лимит: безлимит\n`;
      if (st?.features?.length) ctx += `  Включает: ${st.features.join(" | ")}\n`;
    } else {
      ctx += "\n📦 Активный пакет: НЕТ (пакет не оформлен или истёк)\n";
    }

    if (statsRes.data) {
      const s = statsRes.data;
      ctx += `\n📊 Баланс: кофе ${s.coffee_remaining}/${s.coffee_total}, напитки ${s.drinks_remaining}/${s.drinks_total}\n`;
      ctx += `🔥 Стрик: ${s.current_streak} дней (макс: ${s.max_streak})\n`;
      ctx += `🎁 Бонусы: ${s.bonus_points} баллов\n`;
      ctx += `☕ Всего получено напитков: ${s.total_cups}\n`;
    }

    return ctx;
  } catch (e) {
    console.error("Failed to fetch user context:", e);
    return "";
  }
}

async function fetchAppData(): Promise<string> {
  const now = Date.now();
  if (cachedAppData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log("Using cached app data (age:", Math.round((now - cacheTimestamp) / 60000), "min)");
    return cachedAppData;
  }

  console.log("Refreshing app data from database...");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const [shopsRes, subsRes] = await Promise.all([
    sb.from("shops").select("name, address, addresses, working_hours, city, description").eq("is_active", true).order("sort_order"),
    sb.from("subscription_types").select("name, type, price, cups_count, daily_limit, duration_days, features, description").eq("is_active", true).order("sort_order"),
  ]);

  let dataBlock = "\n\n--- АКТУАЛЬНЫЕ ДАННЫЕ ПРИЛОЖЕНИЯ (автообновление каждые 12 часов) ---\n";

  if (subsRes.data?.length) {
    dataBlock += "\n📋 ПАКЕТЫ И ЦЕНЫ:\n";
    for (const s of subsRes.data) {
      const limitText = s.daily_limit ? `лимит ${s.daily_limit} напитков в день` : "безлимит напитков в день (без ограничений)";
      dataBlock += `\n• "${s.name}" (тип: ${s.type}) — ${s.price.toLocaleString()} ₸`;
      dataBlock += `\n  Количество: ${s.cups_count} напитков`;
      dataBlock += `\n  Срок действия: ${s.duration_days || '?'} дней`;
      dataBlock += `\n  Дневной лимит: ${limitText}`;
      if (s.description) dataBlock += `\n  Описание: ${s.description}`;
      if (s.features?.length) dataBlock += `\n  Включает: ${s.features.join(" | ")}`;
      dataBlock += "\n";
    }
  }

  if (shopsRes.data?.length) {
    dataBlock += "\n☕ КОФЕЙНИ-ПАРТНЁРЫ:\n";
    for (const sh of shopsRes.data) {
      const addrs = sh.addresses?.length ? sh.addresses.join("; ") : sh.address || "адрес не указан";
      dataBlock += `• ${sh.name}${sh.city ? ` (${sh.city})` : ""} — ${addrs}`;
      if (sh.working_hours) dataBlock += `, часы работы: ${sh.working_hours}`;
      if (sh.description) dataBlock += `. ${sh.description}`;
      dataBlock += "\n";
    }
  }

  cachedAppData = dataBlock;
  cacheTimestamp = now;
  console.log("App data cached successfully. Subscriptions:", subsRes.data?.length, "Shops:", shopsRes.data?.length);
  return dataBlock;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language = 'ru' } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch app data (cached) and user context (per-request)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const [appData, userContext] = await Promise.all([
      fetchAppData().catch((e) => { console.error("Failed to fetch app data:", e); return ""; }),
      fetchUserContext(supabaseUrl, supabaseKey, authHeader).catch((e) => { console.error("Failed to fetch user context:", e); return ""; }),
    ]);

    const systemPrompt = getBasePrompt(language) + appData + userContext;

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
