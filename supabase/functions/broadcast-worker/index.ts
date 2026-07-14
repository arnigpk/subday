// Фоновый воркер рассылок. Забирает батчи из broadcast_queue и шлёт их
// (Telegram / FCM), обновляя прогресс в broadcast_messages. Вызывается pg_cron
// раз в минуту и сразу после постановки рассылки. Каждый вызов работает в рамках
// бюджета времени (~40с) и дренит очередь чанками — лимит воркера недостижим.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseFcmServiceAccount, getFcmAccessToken, sendFcmMessage, isInvalidFcmTokenError } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      const sentIds: number[] = []; const failedIds: number[] = [];
      await Promise.all(rows.map(async (r: any) => {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify(r.payload || {}),
          });
          if (resp.ok) { sentIds.push(r.id); summary.notify.sent++; }
          else { failedIds.push(r.id); summary.notify.failed++; }
        } catch { failedIds.push(r.id); summary.notify.failed++; }
      }));
      if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
      if (failedIds.length) await supabase.from('broadcast_queue').update({ status: 'failed', processed_at: new Date().toISOString() }).in('id', failedIds);
    }

    // ---- TELEGRAM ----
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: rows } = await supabase.rpc('claim_broadcast_batch', { _channel: 'telegram', _limit: TG_CHUNK });
      if (!rows || rows.length === 0) break;
      const sentIds: number[] = []; const failedIds: number[] = [];
      await Promise.all(rows.map(async (r: any) => {
        touched.add(r.broadcast_id);
        const h = await getHeader(r.broadcast_id);
        try {
          const resp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: r.target, text: h.message, parse_mode: 'HTML' }),
          });
          const j = await resp.json();
          if (j.ok) { sentIds.push(r.id); summary.telegram.sent++; }
          else { failedIds.push(r.id); summary.telegram.failed++; }
        } catch { failedIds.push(r.id); summary.telegram.failed++; }
      }));
      if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
      if (failedIds.length) await supabase.from('broadcast_queue').update({ status: 'failed', processed_at: new Date().toISOString() }).in('id', failedIds);
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
        const sentIds: number[] = []; const failedIds: number[] = [];
        await Promise.all(rows.map(async (r: any) => {
          touched.add(r.broadcast_id);
          const h = await getHeader(r.broadcast_id);
          const nl = h.message.indexOf('\n');
          const title = nl >= 0 ? h.message.slice(0, nl) : h.message;
          const body = nl >= 0 ? h.message.slice(nl + 1) : '';
          const result = await sendFcmMessage(accessToken!, projectId!, r.target, { title, body });
          if (result.ok) { sentIds.push(r.id); summary.push.sent++; }
          else {
            failedIds.push(r.id); summary.push.failed++;
            if (isInvalidFcmTokenError(result.error)) { invalidTokens.push(r.target); summary.push.cleaned++; }
          }
        }));
        if (sentIds.length) await supabase.from('broadcast_queue').update({ status: 'sent', processed_at: new Date().toISOString() }).in('id', sentIds);
        if (failedIds.length) await supabase.from('broadcast_queue').update({ status: 'failed', processed_at: new Date().toISOString() }).in('id', failedIds);
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
