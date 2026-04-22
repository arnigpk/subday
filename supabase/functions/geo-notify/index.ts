// Edge function: geo-notify
// Получает координаты пользователя + список ближайших кофеен (с расстоянием),
// проверяет ВСЕ условия отправки (подписка, кулдаун 12ч, рабочие часы, дневной лимит,
// последний визит в кофейню, тумблер в профиле) и отправляет FCM push.
//
// Тело запроса: { lat: number, lng: number, candidates: Array<{ shop_id: string, distance_m: number }> }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candidate {
  shop_id: string;
  distance_m: number;
}

interface RequestBody {
  lat: number;
  lng: number;
  candidates: Candidate[];
}

// Парсинг рабочих часов "HH:MM-HH:MM" с учётом часов через полночь.
function isOpenNow(workingHours: string | null | undefined): boolean {
  if (!workingHours) return false;
  const m = workingHours.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const [, oh, om, ch, cm] = m;
  const now = new Date();
  // Используем UTC+5 (KZ) — простое приближение, без zone DB.
  const kzNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const cur = kzNow.getUTCHours() * 60 + kzNow.getUTCMinutes();
  const open = parseInt(oh) * 60 + parseInt(om);
  const close = parseInt(ch) * 60 + parseInt(cm);
  if (close < open) return cur >= open || cur < close;
  return cur >= open && cur < close;
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${headerB64}.${payloadB64}.${sigB64}`,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OAuth token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const candidates = (body.candidates || []).filter(c => c.shop_id && typeof c.distance_m === 'number');
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_candidates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Профиль: проверка тумблера
    const { data: profile } = await supabase
      .from('profiles')
      .select('geo_notifications_enabled, name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || (profile as any).geo_notifications_enabled === false) {
      return new Response(JSON.stringify({ skipped: 'disabled_by_user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Шаблон + конфиг
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('*')
      .eq('trigger_type', 'geo_proximity')
      .eq('is_active', true)
      .maybeSingle();

    if (!template) {
      return new Response(JSON.stringify({ skipped: 'template_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cfg = (template as any).trigger_config || {};
    const radius = cfg.radius_meters ?? 250;
    const cooldownHours = cfg.cooldown_hours ?? 12;
    const visitCooldownHours = cfg.visit_cooldown_hours ?? 12;
    const dailyLimit = cfg.daily_limit ?? 2;
    const maxShops = cfg.max_shops_per_check ?? 1; // обычно шлём 1 ближайшую за вызов
    const requireSub = cfg.requires_subscription !== false;
    const respectHours = cfg.respect_working_hours !== false;
    const pushTitle = cfg.title || 'Забери свой кофе ☕';

    // 4. Проверка активной подписки
    if (requireSub) {
      const { data: subs } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);
      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({ skipped: 'no_subscription' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 5. Дневной лимит
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('geo_notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('sent_at', dayStart.toISOString());

    if ((todayCount ?? 0) >= dailyLimit) {
      return new Response(JSON.stringify({ skipped: 'daily_limit' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Сортировка по дистанции и фильтрация по радиусу
    const inRange = candidates
      .filter(c => c.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, maxShops);

    if (inRange.length === 0) {
      return new Response(JSON.stringify({ skipped: 'out_of_radius' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopIds = inRange.map(c => c.shop_id);

    // 7. Загружаем кофейни
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, working_hours, coordinates, is_active')
      .in('id', shopIds);

    if (!shops || shops.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_shops' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 8. Cooldown по уведомлениям (12ч на кофейню)
    const cooldownStart = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await supabase
      .from('geo_notification_log')
      .select('shop_id')
      .eq('user_id', user.id)
      .gte('sent_at', cooldownStart)
      .in('shop_id', shopIds);
    const recentlyNotifiedSet = new Set((recentNotifs || []).map((r: any) => r.shop_id));

    // 9. Cooldown по визитам (10-12ч после redemption в этой кофейне)
    const visitCooldownStart = new Date(Date.now() - visitCooldownHours * 60 * 60 * 1000).toISOString();
    const { data: recentVisits } = await supabase
      .from('redemptions')
      .select('shop_id')
      .eq('user_id', user.id)
      .gte('redeemed_at', visitCooldownStart)
      .in('shop_id', shopIds);
    const recentlyVisitedSet = new Set((recentVisits || []).map((r: any) => r.shop_id));

    // 10. Выбираем подходящие кофейни (берём первую подходящую по близости)
    let chosen: { shop: any; distance_m: number } | null = null;
    for (const cand of inRange) {
      const shop = shops.find((s: any) => s.id === cand.shop_id);
      if (!shop || !(shop as any).is_active) continue;
      if (recentlyNotifiedSet.has(cand.shop_id)) continue;
      if (recentlyVisitedSet.has(cand.shop_id)) continue;
      if (respectHours && !isOpenNow((shop as any).working_hours)) continue;
      chosen = { shop, distance_m: cand.distance_m };
      break;
    }

    if (!chosen) {
      return new Response(JSON.stringify({ skipped: 'no_eligible_shop' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 11. Формируем сообщение
    const distanceStr = chosen.distance_m < 1000
      ? `${Math.round(chosen.distance_m)}`
      : `${(chosen.distance_m / 1000).toFixed(1)} км`;
    const messageBody = renderTemplate((template as any).message_template, {
      shop_name: (chosen.shop as any).name,
      distance: distanceStr,
      name: (profile as any).name || '',
    });

    // 12. Записываем in-app уведомление
    await supabase.from('push_notifications').insert({
      title: pushTitle,
      message: messageBody,
      user_id: user.id,
    });

    // 13. Логируем для дедупликации
    await supabase.from('geo_notification_log').insert({
      user_id: user.id,
      shop_id: (chosen.shop as any).id,
      distance_meters: Math.round(chosen.distance_m),
    });

    // 14. Шлём FCM push (если есть токены и креды)
    const fcmJson = Deno.env.get('FCM_SERVICE_ACCOUNT');
    let pushSent = 0;
    let pushFailed = 0;
    if (fcmJson) {
      try {
        const sa = JSON.parse(fcmJson);
        if (sa.client_email && sa.private_key && sa.project_id) {
          const { data: tokens } = await supabase
            .from('device_tokens')
            .select('token')
            .eq('user_id', user.id);
          if (tokens && tokens.length > 0) {
            const accessToken = await getAccessToken(sa);
            for (const t of tokens) {
              try {
                const r = await fetch(
                  `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      message: {
                        token: (t as any).token,
                        notification: { title: pushTitle, body: messageBody },
                        data: { route: '/shops', shop_id: (chosen.shop as any).id },
                        android: {
                          priority: 'high',
                          notification: { sound: 'default', channel_id: 'default', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
                        },
                      },
                    }),
                  }
                );
                if (r.ok) pushSent++;
                else { pushFailed++; await r.text(); }
              } catch (e) {
                pushFailed++;
                console.error('FCM send error', e);
              }
            }
          }
        }
      } catch (e) {
        console.error('FCM_SERVICE_ACCOUNT parse error', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      shop_id: (chosen.shop as any).id,
      shop_name: (chosen.shop as any).name,
      distance_m: Math.round(chosen.distance_m),
      push_sent: pushSent,
      push_failed: pushFailed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('geo-notify error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'unknown',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
