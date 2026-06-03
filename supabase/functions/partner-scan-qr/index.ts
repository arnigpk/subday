import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEdgeLogger } from '../_shared/edgeLogger.ts';

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      .eq('user_id', scannerId).in('role', ['partner', 'barista']).maybeSingle();

    const [body, { data: scannerRole }] = await Promise.all([bodyPromise, rolePromise]);
    
    if (!scannerRole) {
      return new Response(JSON.stringify({ error: 'У вас нет прав на сканирование' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { userId, shopId, drinkType, isGuestCoffee } = body;

    if (!allowedShopIds.includes(shopId)) {
      return new Response(JSON.stringify({ error: 'Этот QR принадлежит другой кофейне' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch stats + profile + shop info in parallel
    const [statsResult, profileResult, shopResult] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('name, phone').eq('user_id', userId).maybeSingle(),
      supabase.from('shops').select('name, address, addresses, supported_types, working_hours').eq('id', shopId).maybeSingle(),
    ]);

    // Derive shopName, shopAddress, drinkName from DB — no longer in QR payload
    const shopName = shopResult.data?.name || 'Кофейня';
    const shopAddress = shopResult.data?.addresses?.[0] || shopResult.data?.address || null;
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
          supabase.from('subscription_types').select('name, max_volume').eq('id', grant.subscription_type_id).single()
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

      // Update stats + insert redemption in parallel
      const [updateResult] = await Promise.all([
        supabase.from('user_stats').update({
          guest_coffees: stats.guest_coffees - 1,
          current_streak: newStreak, max_streak: newMaxStreak,
          total_cups: stats.total_cups + 1, bonus_points: stats.bonus_points + bonusForRedemption,
          last_redemption_date: today,
        }).eq('user_id', userId),
        supabase.from('redemptions').insert({
          user_id: userId, shop_name: shopName, shop_id: shopId,
          shop_address: shopAddress || null,
          drink_name: `Гостевой кофе от ID:${inviterPublicId}`,
          drink_type: 'coffee', subscription_name: guestSubscriptionName,
          scanned_by: scannerId,
        }),
      ]);

      if (updateResult.error) {
        await logger.persist('error', 'guest_redeem_failed', {
          user_id: userId, scanner_id: scannerId, shop_id: shopId,
        }, updateResult.error);
        return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (stats.guest_coffees - 1 <= 0 && grant) {
        supabase.from('guest_grants').update({ status: 'consumed' })
          .eq('invitee_user_id', userId).eq('status', 'active').then(() => {});
      }

      await logger.persist('info', 'guest_redeem_ok', {
        user_id: userId, scanner_id: scannerId, shop_id: shopId, shop_name: shopName,
        drink_type: 'coffee', remaining: stats.guest_coffees - 1,
      });

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

    // Check daily limit + get subscription info
    const { data: subscriptions } = await supabase
      .from('user_subscriptions')
      .select(`id, expires_at, daily_limit_override, daily_limit_reset_at, subscription_types ( daily_limit, type, name )`)
      .eq('user_id', userId).eq('is_active', true);

    interface SubTypeInfo { daily_limit: number | null; type: string; name: string; }

    const now = new Date();
    const matchingSub = subscriptions?.find(s => {
      const st = s.subscription_types as unknown as SubTypeInfo | null;
      const notExpired = !s.expires_at || new Date(s.expires_at) > now;
      return st && st.type === drinkType && notExpired;
    });

    // Block if no valid active subscription found (expired by date even if cups remain)
    if (!matchingSub) {
      return new Response(JSON.stringify({ error: 'Подписка истекла или не активна' }),
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

    // Update stats + insert redemption in parallel
    const [updateResult] = await Promise.all([
      supabase.from('user_stats').update(newStats).eq('user_id', userId),
      supabase.from('redemptions').insert({
        user_id: userId, shop_name: shopName, shop_id: shopId,
        shop_address: shopAddress || null,
        drink_name: drinkName, drink_type: drinkType, subscription_name: subscriptionName,
        scanned_by: scannerId,
      }),
    ]);

    if (updateResult.error) {
      await logger.persist('error', 'redeem_failed', {
        user_id: userId, scanner_id: scannerId, shop_id: shopId, drink_type: drinkType,
      }, updateResult.error);
      return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
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
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

    await logger.persist('info', 'redeem_ok', {
      user_id: userId, scanner_id: scannerId, shop_id: shopId, shop_name: shopName,
      drink_type: drinkType, remaining: newRemaining, subscription_name: subscriptionName,
    });

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