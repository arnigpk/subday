// Фоновый воркер рассылок. Забирает батчи из broadcast_queue и шлёт их
// (Telegram / FCM), обновляя прогресс в broadcast_messages. Вызывается pg_cron
// раз в минуту и сразу после постановки рассылки. Каждый вызов работает в рамках
// бюджета времени (~40с) и дренит очередь чанками — лимит воркера недостижим.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseFcmServiceAccount, getFcmAccessToken, sendFcmMessage, isInvalidFcmTokenError } from '../_shared/fcm.ts';
import { hasTags, personalize, type RecipientProfile } from '../_shared/personalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Помечаем неудачные элементы очереди с ТЕКСТОМ причины. Группируем по тексту
// ошибки, чтобы одним UPDATE обновить все элементы с одинаковой причиной (быстро).
// Отказы Telegram, после которых слать этому чату бессмысленно: бот заблокирован,
// аккаунт удалён, диалог не начинали. Всё остальное (лимит частоты, сбой сервера,
// обрыв сети) — временное, человек по-прежнему доступен, и помечать его нельзя.
const TG_PERMANENT = [
  'bot was blocked',
  'user is deactivated',
  'chat not found',
  "bot can't initiate conversation",
  'peer_id_invalid',
  'group chat was deleted',
  'chat_write_forbidden',
];

function isTelegramPermanent(error: string): boolean {
  const e = (error || '').toLowerCase();
  return TG_PERMANENT.some((s) => e.includes(s));
}

/**
 * Запомнить чаты, до которых больше не достучаться. Дальше они не попадут ни в
 * счётчик получателей, ни в новые рассылки. Своя ошибка тут не должна ронять
 * отправку — просто пишем в лог.
 */
async function markTelegramUnreachable(
  supabase: ReturnType<typeof createClient>,
  rows: { chat_id: string; user_id: string | null; reason: string }[],
) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('telegram_unreachable')
    .upsert(rows.map((r) => ({ ...r, marked_at: new Date().toISOString() })), { onConflict: 'chat_id' });
  if (error) console.error('markTelegramUnreachable failed:', error);
  else console.log(`Telegram: помечено недоступными ${rows.length}`);
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  failed: { id: number; error: string }[],
) {
  if (!failed.length) return;
  const byError = new Map<string, number[]>();
  for (const f of failed) {
    const e = (f.error || 'unknown').slice(0, 300);
    const arr = byError.get(e) ?? [];
    arr.push(f.id);
    byError.set(e, arr);
  }
  const at = new Date().toISOString();
  for (const [error, ids] of byError) {
    await supabase.from('broadcast_queue').update({ status: 'failed', error, processed_at: at }).in('id', ids);
  }
}

// Профили пачки одним запросом — только когда в тексте рассылки есть теги
// ({{name}}/{{city}}/{{id}}). Иначе подстановка не нужна и запрос не делаем.
async function loadProfiles(
  supabase: ReturnType<typeof createClient>,
  rows: { user_id?: string }[],
): Promise<Map<string, RecipientProfile>> {
  const map = new Map<string, RecipientProfile>();
  const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  if (!uids.length) return map;
  const { data } = await supabase.from('profiles').select('user_id, name, city, public_id').in('user_id', uids);
  for (const p of (data || []) as any[]) map.set(p.user_id, p);
  return map;
}

const TIME_BUDGET_MS = 40_000;
const TG_CHUNK = 25;          // ~25 сообщений/сек (лимит Telegram ~30/с)
const TG_PACE_MS = 1000;
const PUSH_CHUNK = 100;       // FCM держит высокую конкурентность
const NOTIFY_CHUNK = 10;      // персональные авто-уведомления (каждое — вызов send-subscription-notification)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'];
    const fcmJson = Deno.env.get('FCM_SERVICE_ACCOUNT') || workerEnv['FCM_SERVICE_ACCOUNT'];

    // Доступ только для сервера (cron/энкью шлют service-role ключ).
    const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!serviceKey || auth !== serviceKey) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl!, serviceKey);
    const started = Date.now();
    const touched = new Set<string>();
    const headerCache = new Map<string, { message: string; type: string }>();
    const getHeader = async (bid: string) => {
      if (headerCache.has(bid)) return headerCache.get(bid)!;
      const { data } = await supabase.from('broadcast_messages').select('message, broadcast_type').eq('id', bid).maybeSingle();
      const h = { message: data?.message || '', type: data?.broadcast_type || '' };
      headerCache.set(bid, h);
      return h;
    };

    const summary = { telegram: { sent: 0, failed: 0 }, push: { sent: 0, failed: 0, cleaned: 0 }, notify: { sent: 0, failed: 0 } };

    // ---- NOTIFY (персональные авто-уведомления: low_balance / expiring_soon / ...) ----
    // payload = тело запроса к send-subscription-notification; вся логика шаблонов
    // и каналов остаётся в той функции — здесь только доставка из очереди.
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: rows } = await supabase.rpc('claim_broadcast_batch', { _channel: 'notify', _limit: NOTIFY_CHUNK });
      if (!rows || rows.length === 0) break;
      const sentIds: number[] = []; const failed: { id: number; error: string }[] = [];
      await Promise.all(rows.map(async (r: any) => {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify(r.payload || {}),
          });
          if (resp.ok) { sentIds.push(r.id); summary.notify.sent++; }
          else { const t = await resp.text().catch(() => ''); failed.push({ id: r.id, error: `HTTP ${resp.status} ${t}`.trim() }); summary.notify.failed++; }
        } catch (e) { failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) }); summary.notify.failed++; }
      }));
      if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
      await markFailed(supabase, failed);
    }

    // ---- TELEGRAM ----
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: rows } = await supabase.rpc('claim_broadcast_batch', { _channel: 'telegram', _limit: TG_CHUNK });
      if (!rows || rows.length === 0) break;
      // Персонализация: если хоть в одной рассылке пачки есть теги — грузим профили.
      const tgBids = [...new Set(rows.map((r: any) => r.broadcast_id))];
      await Promise.all(tgBids.map((b) => getHeader(b as string)));
      const tgProfs = tgBids.some((b) => hasTags(headerCache.get(b as string)?.message))
        ? await loadProfiles(supabase, rows) : new Map<string, RecipientProfile>();
      const sentIds: number[] = []; const failed: { id: number; error: string }[] = [];
      const unreachable: { chat_id: string; user_id: string | null; reason: string }[] = [];
      await Promise.all(rows.map(async (r: any) => {
        touched.add(r.broadcast_id);
        const h = await getHeader(r.broadcast_id);
        const text = hasTags(h.message) ? personalize(h.message, tgProfs.get(r.user_id), { html: true }) : h.message;
        try {
          const resp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: r.target, text, parse_mode: 'HTML' }),
          });
          const j = await resp.json();
          if (j.ok) { sentIds.push(r.id); summary.telegram.sent++; }
          else {
            const reason = j.description || `HTTP ${resp.status}`;
            failed.push({ id: r.id, error: reason }); summary.telegram.failed++;
            // Заблокировал бота / удалился / чата нет — больше не пишем сюда никогда.
            if (isTelegramPermanent(reason)) {
              unreachable.push({ chat_id: String(r.target), user_id: r.user_id ?? null, reason: reason.slice(0, 300) });
            }
          }
        } catch (e) { failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) }); summary.telegram.failed++; }
      }));
      if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
      await markFailed(supabase, failed);
      await markTelegramUnreachable(supabase, unreachable);
      if (rows.length === TG_CHUNK) await sleep(TG_PACE_MS); // пейсинг только если очередь ещё полна
    }

    // ---- PUSH (FCM) ----
    const { serviceAccount } = parseFcmServiceAccount(fcmJson);
    if (serviceAccount) {
      let accessToken: string | null = null;
      const projectId = serviceAccount.project_id;
      const invalidTokens: string[] = [];
      while (Date.now() - started < TIME_BUDGET_MS) {
        const { data: rows } = await supabase.rpc('claim_broadcast_batch', { _channel: 'push', _limit: PUSH_CHUNK });
        if (!rows || rows.length === 0) break;
        if (!accessToken) accessToken = await getFcmAccessToken(serviceAccount);
        // Персонализация: грузим профили только если в тексте пачки есть теги.
        const pushBids = [...new Set(rows.map((r: any) => r.broadcast_id))];
        await Promise.all(pushBids.map((b) => getHeader(b as string)));
        const pushProfs = pushBids.some((b) => hasTags(headerCache.get(b as string)?.message))
          ? await loadProfiles(supabase, rows) : new Map<string, RecipientProfile>();
        const sentIds: number[] = []; const failed: { id: number; error: string }[] = [];
        await Promise.all(rows.map(async (r: any) => {
          touched.add(r.broadcast_id);
          const h = await getHeader(r.broadcast_id);
          const raw = hasTags(h.message) ? personalize(h.message, pushProfs.get(r.user_id)) : h.message;
          const nl = raw.indexOf('\n');
          const title = nl >= 0 ? raw.slice(0, nl) : raw;
          const body = nl >= 0 ? raw.slice(nl + 1) : '';
          const result = await sendFcmMessage(accessToken!, projectId!, r.target, { title, body });
          if (result.ok) { sentIds.push(r.id); summary.push.sent++; }
          else {
            const err = typeof result.error === 'string' ? result.error : JSON.stringify(result.error ?? 'FCM error');
            failed.push({ id: r.id, error: isInvalidFcmTokenError(result.error) ? `Токен недействителен: ${err}` : err });
            summary.push.failed++;
            if (isInvalidFcmTokenError(result.error)) { invalidTokens.push(r.target); summary.push.cleaned++; }
          }
        }));
        if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
        await markFailed(supabase, failed);
      }
      // Чистим мёртвые токены пачкой.
      for (let i = 0; i < invalidTokens.length; i += 200) {
        await supabase.from('device_tokens').delete().in('token', invalidTokens.slice(i, i + 200));
      }
    }

    // Обновляем прогресс/финализируем затронутые рассылки (race-free пересчёт из очереди).
    for (const bid of touched) {
      await supabase.rpc('sync_broadcast_progress', { _broadcast_id: bid });
    }

    return json({ ok: true, ...summary, broadcasts: touched.size });
  } catch (e) {
    console.error('broadcast-worker error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
