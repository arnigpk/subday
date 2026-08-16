/**
 * Страна человека по его IP.
 *
 * Зачем своя функция, а не запрос к сервису напрямую из приложения: браузер и
 * webview не пускают такие запросы на чужой домен без разрешающего заголовка,
 * а бесплатные геосервисы его не отдают. Из-за этого прежний вызов ipapi.co
 * падал по CORS и в вебе, и в нативе — то есть не работал нигде. У нашего
 * домена таких ограничений нет.
 *
 * Отвечает `{ "country": "UZ" }` либо `{ "country": null }`, если определить не
 * вышло. Приложение в этом случае остаётся на стране, вычисленной по часовому
 * поясу, — она мгновенная и не требует сети.
 *
 * Входа не требует намеренно: экран выбора страны показывается ДО входа.
 * Ничего чувствительного функция не отдаёт — только страну самого звонящего,
 * которую его провайдер и так знает.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Страны, которые приложение вообще умеет. Остальное — как «не определили». */
const SUPPORTED = new Set(["KZ", "KG", "UZ", "RU"]);

/** Ответ держим в памяти воркера: один и тот же адрес часто спрашивает подряд. */
const cache = new Map<string, { country: string | null; at: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Локальные и служебные адреса — по ним страну не определить. */
function isPrivate(ip: string): boolean {
  return (
    ip === "" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

function clientIp(req: Request): string {
  // Порядок важен. До функции запрос идёт через nginx и Kong, и x-real-ip к
  // этому моменту содержит внутренний адрес Kong (172.18.0.1) — по нему страну
  // не определить. Настоящий адрес человека стоит ПЕРВЫМ в цепочке
  // x-forwarded-for, дальше идут промежуточные узлы.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = clientIp(req);
  if (isPrivate(ip)) return json({ country: null, reason: "private_ip" });

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return json({ country: hit.country, cached: true });
  }

  try {
    // Запрос идёт с сервера, поэтому ограничения браузера тут не действуют.
    // Таймаут обязателен: без него зависший геосервис задержал бы ответ, а
    // приложение ждёт его на экране входа.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: ctl.signal,
      headers: { "User-Agent": "subday-detect-country/1.0" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      cache.set(ip, { country: null, at: Date.now() });
      return json({ country: null, reason: "lookup_failed" });
    }

    const code = (await res.text()).trim().toUpperCase();
    const country = SUPPORTED.has(code) ? code : null;
    cache.set(ip, { country, at: Date.now() });
    return json({ country });
  } catch {
    // Сеть подвела — не беда: приложение останется на часовом поясе.
    cache.set(ip, { country: null, at: Date.now() });
    return json({ country: null, reason: "unavailable" });
  }
});
