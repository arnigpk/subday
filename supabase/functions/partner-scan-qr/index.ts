import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEdgeLogger } from '../_shared/edgeLogger.ts';
import { processRedemptionOrder } from '../_shared/iiko.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScanRequest {
  userId: string;
  shopId: string;
  shopName: string;
  shopAddress?: string;
  drinkType: 'coffee' | 'drinks';
  drinkName: string;
  isGuestCoffee?: boolean;
  address?: string; // адрес/касса, подтверждённый баристой на скане (для iiko)
}

function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

function sendTelegramMessage(telegramId: string, message: string, botToken: string): void {
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: 'HTML' }),
  }).catch(err => console.error('Telegram notification error:', err));
}

function calculateStreak(stats: any, today: string) {
  const isNewDay = stats.last_redemption_date !== today;
  let newStreak = stats.current_streak;
  if (isNewDay) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (stats.last_redemption_date === yesterdayStr) newStreak = stats.current_streak + 1;
    else newStreak = 1;
  }
  return { newStreak, newMaxStreak: Math.max(newStreak, stats.max_streak) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Требуется авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const logger = createEdgeLogger('partner-scan-qr', supabase);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: claimsError } = await supabase.auth.getUser(token);
    
    if (claimsError || !authUser) {
      logger.warn('auth_failed', { reason: claimsError?.message ?? 'no_user' });
      return new Response(JSON.stringify({ error: 'Ошибка авторизации' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scannerId = authUser.id;

    const bodyPromise = req.json() as Promise<ScanRequest>;
    const rolePromise = supabase
      .from('user_roles').select('role, shop_id')
      .eq('user_id', scannerId).in('role', ['partner', 'barista']);

    const [body, { data: scannerRoles }] = await Promise.all([bodyPromise, rolePromise]);

    if (!scannerRoles || scannerRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'У вас нет прав на сканирование' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { userId, shopId, drinkType, isGuestCoffee } = body;

    const allowedShopIds = scannerRoles.map((r: any) => r.shop_id).filter(Boolean);
    if (!allowedShopIds.includes(shopId)) {
      return new Response(JSON.stringify({ error: 'Этот QR принадлежит другой кофейне' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch stats + profile + shop + subscriptions in parallel (один слой round-trip'ов
    // вместо двух — на слабом интернете это заметно ускоряет ответ).
    const [statsResult, profileResult, shopResult, subsResult, shiftResult] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('name, phone').eq('user_id', userId).maybeSingle(),
      supabase.from('shops').select('name, address, addresses, supported_types, working_hours, revenue_share_percent').eq('id', shopId).maybeSingle(),
      supabase
        .from('user_subscriptions')
        .select(`id, subscription_type_id, expires_at, is_frozen, freeze_until, daily_limit_override, daily_limit_reset_at, subscription_types ( daily_limit, type, name, price, cups_count, revenue_share_percent )`)
        .eq('user_id', userId).eq('is_active', true),
      // Активная смена сканирующего бариста — источник правды для адреса/кассы.
      supabase.from('barista_shifts').select('address, expires_at').eq('user_id', scannerId).maybeSingle(),
    ]);

    // Derive shopName, drinkName from DB. Адрес: подтверждённый на скане (body.address)
    // → адрес активной смены → первый адрес кофейни. Это же — ключ маршрутизации кассы iiko.
    const shopName = shopResult.data?.name || 'Кофейня';
    const shiftActive = shiftResult.data?.expires_at ? new Date(shiftResult.data.expires_at) > new Date() : false;
    const shiftAddress = shiftActive ? (shiftResult.data?.address || null) : null;
    const requestedAddress = typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null;
    const shopAddress = requestedAddress || shiftAddress || shopResult.data?.addresses?.[0] || shopResult.data?.address || null;
    const drinkName = drinkType === 'coffee' ? 'Кофе' : 'Ланч';

    const stats = statsResult.data;
    if (!stats) {
      return new Response(JSON.stringify({ error: 'Пользователь не найден' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if shop is open
    if (shopResult.data?.working_hours) {
      const hours = shopResult.data.working_hours;
      const match = hours.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
      if (match) {
        const now = new Date();
        const currentMinutes = now.getUTCHours() * 60 + now.getMinutes();
        const offsetMinutes = 5 * 60;
        const localMinutes = (currentMinutes + offsetMinutes) % (24 * 60);
        const openTime = parseInt(match[1]) * 60 + parseInt(match[2]);
        const closeTime = parseInt(match[3]) * 60 + parseInt(match[4]);
        let isOpen: boolean;
        if (closeTime < openTime) {
          isOpen = localMinutes >= openTime || localMinutes < closeTime;
        } else {
          isOpen = localMinutes >= openTime && localMinutes < closeTime;
        }
        if (!isOpen) {
          return new Response(JSON.stringify({ error: 'Кофейня сейчас закрыта' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    if (drinkType === 'drinks' && shopResult.data) {
      const supportedTypes = shopResult.data.supported_types || ['coffee'];
      if (!supportedTypes.includes('drinks')) {
        return new Response(JSON.stringify({ error: 'Эта кофейня не поддерживает ланч' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const profile = profileResult.data;
    const today = new Date().toISOString().split('T')[0];
    const bonusForRedemption = 10;

    // Determine if this is a guest coffee redemption
    const useGuestCoffee = isGuestCoffee && stats.guest_coffees > 0;

    if (useGuestCoffee) {
      // ===== GUEST COFFEE REDEMPTION =====
      // Fetch grant with subscription_type info
      const { data: grant } = await supabase
        .from('guest_grants')
        .select('inviter_user_id, subscription_type_id')
        .eq('invitee_user_id', userId).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      let inviterPublicId = '???';
      let guestSubscriptionName = 'Гостевой доступ';
      
      // Fetch inviter info and subscription type info in parallel
      // Use any[] — PostgrestBuilder is thenable but not a true Promise in newer SDK versions.
      const fetchPromises: any[] = [];
      
      if (grant?.inviter_user_id) {
        fetchPromises.push(
          supabase.from('profiles').select('public_id').eq('user_id', grant.inviter_user_id).maybeSingle()
        );
      } else {
        fetchPromises.push(Promise.resolve({ data: null }));
      }
      
      if (grant?.subscription_type_id) {
        fetchPromises.push(
          supabase.from('subscription_types').select('name, max_volume, price, cups_count, revenue_share_percent').eq('id', grant.subscription_type_id).single()
        );
      } else {
        fetchPromises.push(Promise.resolve({ data: null }));
      }
      
      const [inviterProfileResult, subTypeResult] = await Promise.all(fetchPromises);
      
      if (inviterProfileResult?.data?.public_id) {
        inviterPublicId = inviterProfileResult.data.public_id;
      }
      
      if (subTypeResult?.data?.name) {
        guestSubscriptionName = subTypeResult.data.name;
      }

      const { newStreak, newMaxStreak } = calculateStreak(stats, today);

      // === Списание гостевого кофе с ГАРАНТИЕЙ (как в обычном пути) ===
      // 1) Атомарно: обновляем только если guest_coffees не изменился и ещё > 0.
      const { data: guestUpdatedRows, error: guestUpdErr } = await supabase
        .from('user_stats')
        .update({
          guest_coffees: stats.guest_coffees - 1,
          current_streak: newStreak, max_streak: newMaxStreak,
          total_cups: stats.total_cups + 1, bonus_points: stats.bonus_points + bonusForRedemption,
          last_redemption_date: today,
        })
        .eq('user_id', userId)
        .eq('guest_coffees', stats.guest_coffees)
        .gt('guest_coffees', 0)
        .select('user_id');

      if (guestUpdErr || !guestUpdatedRows || guestUpdatedRows.length === 0) {
        await logger.persist('error', 'guest_redeem_update_failed', {
          user_id: userId, scanner_id: scannerId, shop_id: shopId,
          rows: guestUpdatedRows?.length ?? 0,
        }, guestUpdErr || undefined);
        return new Response(JSON.stringify({ error: 'Не удалось списать, попробуйте ещё раз' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Снимок расчёта выплаты (как в обычном пути) — по гостевому тарифу.
      const gSub = subTypeResult?.data as any;
      const guestPayoutPercent = gSub?.revenue_share_percent
        ?? (shopResult.data as any)?.revenue_share_percent
        ?? 70;

      // 2) История. Если не удалось — откатываем списание.
      const { error: guestInsErr } = await supabase.from('redemptions').insert({
        user_id: userId, shop_name: shopName, shop_id: shopId,
        shop_address: shopAddress || null,
        drink_name: `Гостевой кофе от ID:${inviterPublicId}`,
        drink_type: 'coffee', subscription_name: guestSubscriptionName,
        scanned_by: scannerId,
        subscription_type_id: grant?.subscription_type_id ?? null,
        payout_price: gSub?.price ?? null,
        payout_cups: gSub?.cups_count ?? null,
        payout_percent: guestPayoutPercent,
      });
      if (guestInsErr) {
        await supabase.from('user_stats').update({
          guest_coffees: stats.guest_coffees,
          current_streak: stats.current_streak, max_streak: stats.max_streak,
          total_cups: stats.total_cups, bonus_points: stats.bonus_points,
          last_redemption_date: stats.last_redemption_date,
        }).eq('user_id', userId);
        await logger.persist('error', 'guest_redeem_insert_failed_rolledback', {
          user_id: userId, scanner_id: scannerId, shop_id: shopId,
        }, guestInsErr);
        return new Response(JSON.stringify({ error: 'Не удалось сохранить списание, попробуйте ещё раз' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (stats.guest_coffees - 1 <= 0 && grant) {
        supabase.from('guest_grants').update({ status: 'consumed' })
          .eq('invitee_user_id', userId).eq('status', 'active').then(() => {});
      }

      // Лог пишем в фоне — не держим ответ клиенту (списание уже подтверждено).
      logger.persist('info', 'guest_redeem_ok', {
        user_id: userId, scanner_id: scannerId, shop_id: shopId, shop_name: shopName,
        drink_type: 'coffee', remaining: stats.guest_coffees - 1,
      }).catch(() => {});

      return new Response(JSON.stringify({
        success: true, customerName: profile?.name || 'Клиент',
        drinkName: subTypeResult?.data?.name ? `Гостевой кофе (${subTypeResult.data.name})` : 'Гостевой кофе',
        remaining: stats.guest_coffees - 1,
        isGuestRedemption: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== REGULAR SUBSCRIPTION REDEMPTION =====
    const remaining = drinkType === 'coffee' ? stats.coffee_remaining : stats.drinks_remaining;
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: drinkType === 'coffee' ? 'У клиента закончился кофе' : 'У клиента закончились ланчи' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Подписки уже загружены параллельно выше.
    const subscriptions = subsResult.data;

    interface SubTypeInfo { daily_limit: number | null; type: string; name: string; price: number | null; cups_count: number | null; revenue_share_percent: number | null; }

    const now = new Date();
    const isFrozenNow = (s: any) => s.is_frozen && s.freeze_until && new Date(s.freeze_until) > now;
    const matchingSub = subscriptions?.find(s => {
      const st = s.subscription_types as unknown as SubTypeInfo | null;
      const notExpired = !s.expires_at || new Date(s.expires_at) > now;
      return st && st.type === drinkType && notExpired && !isFrozenNow(s);
    });

    // Block if no valid active subscription found (expired by date even if cups remain)
    if (!matchingSub) {
      // Distinguish a frozen subscription for a clearer message.
      const frozenSub = subscriptions?.find(s => {
        const st = s.subscription_types as unknown as SubTypeInfo | null;
        return st && st.type === drinkType && isFrozenNow(s);
      });
      return new Response(JSON.stringify({ error: frozenSub ? 'Подписка заморожена' : 'Подписка истекла или не активна' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const subTypes = matchingSub?.subscription_types as unknown as SubTypeInfo | null;
    
    const effectiveDailyLimit = (matchingSub as any)?.daily_limit_override ?? subTypes?.daily_limit;
    
    if (effectiveDailyLimit !== null && effectiveDailyLimit !== undefined) {
      const resetAt = (matchingSub as any)?.daily_limit_reset_at;
      const countAfter = resetAt && resetAt.startsWith(today) ? resetAt : `${today}T00:00:00`;
      
      const { count: todayCount } = await supabase
        .from('redemptions').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('drink_type', drinkType)
        .gte('redeemed_at', countAfter).lt('redeemed_at', `${today}T23:59:59.999`);

      if ((todayCount || 0) >= effectiveDailyLimit) {
        return new Response(JSON.stringify({ 
          error: `Дневной лимит исчерпан (${effectiveDailyLimit} в день)`, dailyLimitReached: true 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { newStreak, newMaxStreak } = calculateStreak(stats, today);

    const newStats = {
      coffee_remaining: drinkType === 'coffee' ? stats.coffee_remaining - 1 : stats.coffee_remaining,
      drinks_remaining: drinkType === 'drinks' ? stats.drinks_remaining - 1 : stats.drinks_remaining,
      current_streak: newStreak, max_streak: newMaxStreak,
      total_cups: stats.total_cups + 1, bonus_points: stats.bonus_points + bonusForRedemption,
      last_redemption_date: today,
    };

    const subscriptionName = subTypes?.name || null;

    // Снимок расчёта выплаты на момент списания (чтобы старые выплаты не менялись
    // при смене цены/процента). Процент: подписки → магазина → 70 по умолчанию.
    const payoutPrice = subTypes?.price ?? null;
    const payoutCups = subTypes?.cups_count ?? null;
    const payoutPercent = subTypes?.revenue_share_percent
      ?? (shopResult.data as any)?.revenue_share_percent
      ?? 70;

    // === Списание с ГАРАНТИЕЙ: success ТОЛЬКО если чашка реально списана И записана в историю ===
    const balCol = drinkType === 'coffee' ? 'coffee_remaining' : 'drinks_remaining';
    const oldBal = drinkType === 'coffee' ? stats.coffee_remaining : stats.drinks_remaining;

    // 1) Атомарное списание: обновляем строку ТОЛЬКО если баланс не изменился с момента
    //    чтения (защита от гонок/двойного скана) и ещё > 0. .select() подтверждает,
    //    что реально обновлена ровно 1 строка — иначе НЕТ ложного успеха.
    const { data: updatedRows, error: updErr } = await supabase
      .from('user_stats')
      .update(newStats)
      .eq('user_id', userId)
      .eq(balCol, oldBal)
      .gt(balCol, 0)
      .select('user_id');

    if (updErr || !updatedRows || updatedRows.length === 0) {
      await logger.persist('error', 'redeem_update_failed', {
        user_id: userId, scanner_id: scannerId, shop_id: shopId, drink_type: drinkType,
        rows: updatedRows?.length ?? 0,
      }, updErr || undefined);
      return new Response(JSON.stringify({ error: 'Не удалось списать, попробуйте ещё раз' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) Пишем историю. Если не удалось — ОТКАТЫВАЕМ списание, чтобы не было
    //    списания без записи в истории.
    const { data: insertedRedemption, error: insErr } = await supabase.from('redemptions').insert({
      user_id: userId, shop_name: shopName, shop_id: shopId,
      shop_address: shopAddress || null,
      drink_name: drinkName, drink_type: drinkType, subscription_name: subscriptionName,
      scanned_by: scannerId,
      subscription_type_id: (matchingSub as any)?.subscription_type_id ?? null,
      payout_price: payoutPrice, payout_cups: payoutCups, payout_percent: payoutPercent,
    }).select('id').single();
    if (insErr) {
      await supabase.from('user_stats').update({
        coffee_remaining: stats.coffee_remaining,
        drinks_remaining: stats.drinks_remaining,
        current_streak: stats.current_streak,
        max_streak: stats.max_streak,
        total_cups: stats.total_cups,
        bonus_points: stats.bonus_points,
        last_redemption_date: stats.last_redemption_date,
      }).eq('user_id', userId);
      await logger.persist('error', 'redeem_insert_failed_rolledback', {
        user_id: userId, scanner_id: scannerId, shop_id: shopId, drink_type: drinkType,
      }, insErr);
      return new Response(JSON.stringify({ error: 'Не удалось сохранить списание, попробуйте ещё раз' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const newRemaining = drinkType === 'coffee' ? newStats.coffee_remaining : newStats.drinks_remaining;

    if (newRemaining <= 0 && matchingSub) {
      supabase.from('user_subscriptions')
        .update({ is_active: false })
        .eq('id', matchingSub.id)
        .then(({ error: deactivateError }) => {
          if (deactivateError) {
            logger.error('subscription_deactivation_failed', { user_id: userId, subscription_id: matchingSub.id }, deactivateError);
          } else {
            logger.info('subscription_deactivated', { user_id: userId, subscription_id: matchingSub.id, drink_type: drinkType });
            // Notify user that subscription ran out of cups
            fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({
                type: 'subscription_expired',
                userId,
                subscriptionName: subTypes?.name || 'Подписка',
                drinkType,
              }),
            }).catch(err => console.error('Cups-expired notification error:', err));
          }
        });
    }

    // iiko: падение заказа в кассу «на вынос» + (опц.) автозакрытие. В фоне —
    // не держим баристу; сбой iiko НЕ влияет на списание (оно уже подтверждено).
    if (insertedRedemption?.id && (matchingSub as any)?.subscription_type_id) {
      const orderPromise = processRedemptionOrder(supabase, {
        redemptionId: insertedRedemption.id,
        shopId,
        address: shopAddress,
        subscriptionTypeId: (matchingSub as any).subscription_type_id,
      }).catch((e) => { console.error('iiko order error:', e); });
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(orderPromise); else await orderPromise;
    }

    // Лог пишем в фоне — не держим ответ клиенту (списание уже подтверждено).
    logger.persist('info', 'redeem_ok', {
      user_id: userId, scanner_id: scannerId, shop_id: shopId, shop_name: shopName,
      drink_type: drinkType, remaining: newRemaining, subscription_name: subscriptionName,
    }).catch(() => {});

    return new Response(JSON.stringify({
      success: true, customerName: profile?.name || 'Клиент',
      drinkName, remaining: newRemaining,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(), fn: 'partner-scan-qr', level: 'error',
      action: 'unhandled_error', err: error instanceof Error ? error.message : String(error),
    }));
    return new Response(JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});