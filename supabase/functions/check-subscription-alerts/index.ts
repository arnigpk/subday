import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Periodic edge function that checks ALL active subscriptions for:
 * 1. Low balance (e.g. remaining = 5 or 2)
 * 2. Expiring soon (e.g. 5 or 2 days left)
 * 
 * Uses a "last_alert_key" stored in trigger_config to avoid duplicate notifications.
 * This replaces the old QR-scan-based notification triggers.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    console.log('Running subscription alerts check...');

    // 1. Fetch low_balance templates
    const { data: lowBalanceTemplates } = await supabase
      .from('auto_notification_templates')
      .select('*')
      .eq('trigger_type', 'low_balance')
      .eq('is_active', true);

    // 2. Fetch expiring_soon templates
    const { data: expiryTemplates } = await supabase
      .from('auto_notification_templates')
      .select('*')
      .eq('trigger_type', 'expiring_soon')
      .eq('is_active', true);

    // 2b. Fetch guest_coffee_expiring template (fires when guest coffee has 1 day left)
    const { data: guestExpiringTemplates } = await supabase
      .from('auto_notification_templates')
      .select('id')
      .eq('trigger_type', 'guest_coffee_expiring')
      .eq('is_active', true)
      .limit(1);
    const guestExpiringActive = (guestExpiringTemplates || []).length > 0;

    const lowThresholds = (lowBalanceTemplates || [])
      .map(t => (t.trigger_config as any)?.threshold)
      .filter(Boolean) as number[];

    const expiryThresholds = (expiryTemplates || [])
      .map(t => (t.trigger_config as any)?.threshold)
      .filter(Boolean) as number[];

    if (lowThresholds.length === 0 && expiryThresholds.length === 0 && !guestExpiringActive) {
      return new Response(JSON.stringify({ success: true, message: 'No active alert templates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sentCount = 0;

    // Уведомления НЕ шлём по одному через await fetch (последовательный обход
    // упирался бы в лимит времени воркера при росте базы). Собираем задачи и
    // одним bulk-insert ставим в broadcast_queue (channel='notify'); дренит их
    // broadcast-worker, вызывая send-subscription-notification с payload.
    // Дедуп остаётся здесь же, ДО постановки — семантика прежняя, но постановка
    // durable: сбой сети больше не теряет уведомление навсегда.
    const notifyJobs: Array<{ userId: string; payload: Record<string, unknown> }> = [];
    const enqueueNotification = (userId: string, payload: Record<string, unknown>) => {
      notifyJobs.push({ userId, payload });
      sentCount++;
    };

    // 3. Check low balance for all active users
    if (lowThresholds.length > 0) {
      const sortedThresholds = [...lowThresholds].sort((a, b) => a - b); // по возрастанию

      // ВАЖНО: идём ОТ активных подписок (их мало), а не от user_stats.
      // Старый подход (`остаток <= порога` по всей user_stats) захватывал ВСЕХ
      // пользователей (у неподписчиков 0 кофе), а затем .in() с сотнями UUID
      // превышал лимит длины URL у шлюза → запрос молча падал → "Sent 0".
      const { data: activeSubs, error: subsErr } = await supabase
        .from('user_subscriptions')
        .select('user_id, subscription_type_id, subscription_types(name, type)')
        .eq('is_active', true);
      if (subsErr) console.error('low_balance: active subs query failed:', subsErr);

      const activeSubMap = new Map<string, any[]>();
      for (const sub of (activeSubs || [])) {
        if (!activeSubMap.has(sub.user_id)) activeSubMap.set(sub.user_id, []);
        activeSubMap.get(sub.user_id)!.push(sub);
      }

      // Статистику подписчиков берём ЧАНКАМИ, чтобы .in() не превышал лимит URL.
      const subUserIds = [...activeSubMap.keys()];
      const lowBalanceUsers: Array<{ user_id: string; coffee_remaining: number; drinks_remaining: number }> = [];
      for (let i = 0; i < subUserIds.length; i += 100) {
        const chunk = subUserIds.slice(i, i + 100);
        const { data: statsRows, error: statsErr } = await supabase
          .from('user_stats')
          .select('user_id, coffee_remaining, drinks_remaining')
          .in('user_id', chunk);
        if (statsErr) { console.error('low_balance: stats chunk failed:', statsErr); continue; }
        for (const r of (statsRows || [])) lowBalanceUsers.push(r as any);
      }

      {
        for (const user of lowBalanceUsers) {
          const subs = activeSubMap.get(user.user_id);
          if (!subs) continue;

          for (const sub of subs) {
            const st = sub.subscription_types as any;
            if (!st) continue;
            const remaining = st.type === 'coffee' ? user.coffee_remaining : user.drinks_remaining;
            if (remaining <= 0) continue;

            // Целевой порог = НАИМЕНЬШИЙ, при котором остаток ≤ порога (самое
            // релевантное предупреждение). Срабатывает НА ДОСТИЖЕНИИ (даже если
            // баланс «перепрыгнул» точное значение). Одно уведомление за проверку.
            const target = sortedThresholds.find(t => remaining <= t);
            if (target === undefined) continue;

            // Дедуп: повторно НЕ шлём (не спамим каждые 15 мин). Дедуп очищается
            // при переподключении тарифа (activate_subscription) — тогда придёт заново.
            const alertKey = `low_balance_${st.type}_${target}`;
            const { data: existing } = await supabase
              .from('notification_dedupe_log')
              .select('id')
              .eq('user_id', user.user_id)
              .eq('alert_key', alertKey)
              .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (existing && existing.length > 0) continue;

            await supabase.from('notification_dedupe_log').insert({
              user_id: user.user_id,
              alert_key: alertKey,
            });

            // cupsCount = реальный остаток (для {{count}}), threshold = порог (для подбора шаблона).
            enqueueNotification(user.user_id, {
              type: 'low_balance',
              userId: user.user_id,
              cupsCount: remaining,
              threshold: target,
              subscriptionName: st.name || (st.type === 'coffee' ? 'Кофе' : 'Ланч'),
              drinkType: st.type,
            });
          }
        }
      }
    }

    // 4. Check expiring soon for all active subscriptions
    if (expiryThresholds.length > 0) {
      const maxDays = Math.max(...expiryThresholds);
      const futureDate = new Date(Date.now() + (maxDays + 1) * 24 * 60 * 60 * 1000).toISOString();

      const { data: expiringSubs } = await supabase
        .from('user_subscriptions')
        .select('user_id, expires_at, subscription_types(name, type)')
        .eq('is_active', true)
        .not('expires_at', 'is', null)
        .lte('expires_at', futureDate);

      if (expiringSubs) {
        const now = new Date();
        for (const sub of expiringSubs) {
          const expiresAt = new Date(sub.expires_at!);
          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

          for (const threshold of expiryThresholds) {
            if (daysLeft === threshold) {
              const st = sub.subscription_types as any;
              if (!st) continue;

              // Check if already sent (independent of in-app toggle)
              const alertKey = `expiring_soon_${st.type}_${threshold}`;
              const { data: existing } = await supabase
                .from('notification_dedupe_log')
                .select('id')
                .eq('user_id', sub.user_id)
                .eq('alert_key', alertKey)
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .limit(1);

              if (existing && existing.length > 0) continue;

              // Mark as sent
              await supabase.from('notification_dedupe_log').insert({
                user_id: sub.user_id,
                alert_key: alertKey,
              });

              enqueueNotification(sub.user_id, {
                type: 'expiring_soon',
                userId: sub.user_id,
                daysCount: daysLeft,
                subscriptionName: st.name || 'Подписка',
              });
            }
          }
        }
      }
    }

    // 5. Guest coffee expiring — 1 day left
    if (guestExpiringActive) {
      const now = new Date();
      const within2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

      const { data: guestUsers } = await supabase
        .from('user_stats')
        .select('user_id, guest_coffees, guest_expires_at')
        .gt('guest_coffees', 0)
        .not('guest_expires_at', 'is', null)
        .gt('guest_expires_at', now.toISOString())
        .lte('guest_expires_at', within2Days);

      for (const u of (guestUsers || [])) {
        const daysLeft = Math.ceil((new Date(u.guest_expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysLeft !== 1) continue;

        const alertKey = 'guest_coffee_expiring';
        const { data: existing } = await supabase
          .from('notification_dedupe_log')
          .select('id')
          .eq('user_id', u.user_id)
          .eq('alert_key', alertKey)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from('notification_dedupe_log').insert({ user_id: u.user_id, alert_key: alertKey });

        enqueueNotification(u.user_id, { type: 'guest_coffee_expiring', userId: u.user_id });
      }
    }

    // Bulk-постановка собранных уведомлений в очередь + пинок воркера.
    if (notifyJobs.length > 0) {
      const rows = notifyJobs.map(j => ({ channel: 'notify', target: j.userId, user_id: j.userId, payload: j.payload }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: qErr } = await supabase.from('broadcast_queue').insert(rows.slice(i, i + 500));
        if (qErr) console.error('Failed to enqueue notify jobs:', qErr);
      }
      fetch(`${supabaseUrl}/functions/v1/broadcast-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: '{}',
      }).catch(() => {});
    }

    console.log(`Subscription alerts check completed. Queued ${sentCount} notifications.`);

    return new Response(
      JSON.stringify({ success: true, sentCount, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
