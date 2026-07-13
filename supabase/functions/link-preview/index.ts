import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public link-preview renderer. nginx proxies social-media crawlers
// (facebookexternalhit / WhatsApp / Telegrambot / Twitterbot / ...) hitting
// /shops/:id and /subflow?post=:id here, passing ?type=shop|post&id=<uuid>.
// Real users keep getting the SPA (index.html) untouched.
//
// No JWT/auth: crawlers can't authenticate. Reads use the service role so RLS
// never hides a public preview. Only non-sensitive fields are ever emitted.

const SITE = "https://web.subday.app";
const DEFAULT_IMAGE = `${SITE}/og-default.png`;
const DEFAULT_TITLE = "subday — specialty coffee & HoReCa subscriptions";
const DEFAULT_DESC = "Подписки на кофе и напитки. Забирай быстрее и экономь больше.";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/.test(lower) || lower.includes("video");
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

// For a video media URL the poster frame is uploaded next to it as
// `<video>.poster.jpg` by the create-post flow. Older videos have no poster —
// verify it exists, otherwise fall back to the default image.
async function previewImage(mediaUrl: string | null | undefined): Promise<string> {
  if (!mediaUrl) return DEFAULT_IMAGE;
  if (!isVideoUrl(mediaUrl)) return mediaUrl;
  const poster = `${mediaUrl}.poster.jpg`;
  return (await urlExists(poster)) ? poster : DEFAULT_IMAGE;
}

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
}): string {
  const { title, description, image, url } = opts;
  const t = esc(title);
  const d = esc(description);
  const img = esc(image);
  const u = esc(url);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="subday" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${img}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
<!-- Any human that lands here (not a crawler) continues into the app/SPA. -->
<meta http-equiv="refresh" content="0; url=${u}" />
</head>
<body><a href="${u}">${t}</a></body>
</html>`;
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      ...cors,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const reqUrl = new URL(req.url);
  const type = reqUrl.searchParams.get("type");
  const id = reqUrl.searchParams.get("id");

  // Fallback default so a crawler always gets *something* valid.
  const fallback = () =>
    htmlResponse(
      renderHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        image: DEFAULT_IMAGE,
        url: type === "post" ? `${SITE}/subflow?post=${id ?? ""}` : SITE,
      })
    );

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || workerEnv["SUPABASE_URL"];
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || workerEnv["SUPABASE_SERVICE_ROLE_KEY"];
    if (!supabaseUrl || !serviceKey || !type || !id) return fallback();

    const supabase = createClient(supabaseUrl, serviceKey);

    if (type === "shop") {
      const { data: shop } = await supabase
        .from("shops")
        .select("name, address, logo_url, gallery_urls")
        .eq("id", id)
        .maybeSingle();
      if (!shop) return fallback();
      const image =
        (Array.isArray(shop.gallery_urls) && shop.gallery_urls[0]) ||
        shop.logo_url ||
        DEFAULT_IMAGE;
      return htmlResponse(
        renderHtml({
          title: `${shop.name} — в подписке subday ☕`,
          description: shop.address || "Кофейня в подписке subday. Забирай напитки быстрее и экономь.",
          image,
          url: `${SITE}/shops/${id}`,
        })
      );
    }

    if (type === "post") {
      const { data: post } = await supabase
        .from("subflow_posts")
        .select("content, image_url, image_urls, shop_name")
        .eq("id", id)
        .maybeSingle();
      if (!post) return fallback();
      const firstMedia =
        (Array.isArray(post.image_urls) && post.image_urls[0]) || post.image_url || null;
      const image = await previewImage(firstMedia);
      const text = (post.content || "").trim().replace(/\s+/g, " ");
      const description = text.length > 180 ? `${text.slice(0, 177)}…` : text || DEFAULT_DESC;
      return htmlResponse(
        renderHtml({
          title: post.shop_name ? `${post.shop_name} · #subFlow` : "subday · #subFlow",
          description,
          image,
          url: `${SITE}/subflow?post=${id}`,
        })
      );
    }

    return fallback();
  } catch (e) {
    console.error("link-preview error:", e);
    return fallback();
  }
});
