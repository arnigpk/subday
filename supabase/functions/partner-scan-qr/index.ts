import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScanRequest {
  userId: string;
  shopId: string;
  shopName: string;
  drinkType: 'coffee' | 'drinks';
  drinkName: string;
  isGuestCoffee?: boolean;
}

function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

function sendTelegramMessage(telegramId: string, message: string, botToken: string): void {
  // Fire-and-forget
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Ошибка авторизации' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scannerId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body and check scanner role in parallel
    const bodyPromise = req.json() as Promise<ScanRequest>;
    const rolePromise = supabase
      .from('user_roles').select('role, shop_id')
      .eq('user_id', scannerId).in('role', ['partner', 'barista']).maybeSingle();

    const [body, { data: scannerRole }] = await Promise.all([bodyPromise, rolePromise]);
    
    if (!scannerRole) {
      return new Response(JSON.stringify({ error: 'У вас нет прав на сканирование' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { userId, shopId, shopName, drinkType, drinkName, isGuestCoffee } = body;

    if (scannerRole.shop_id !== shopId) {
      return new Response(JSON.stringify({ error: 'Этот QR принадлежит другой кофейне' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch stats + profile + shop info in parallel
    const [statsResult, profileResult, shopResult] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('name, phone').eq('user_id', userId).maybeSingle(),
      supabase.from('shops').select('supported_types, working_hours').eq('id', shopId).maybeSingle(),
    ]);

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
        // Adjust for timezone offset (~+5 for KZ/UZ/KG, +3 for RU) - use +5 as default
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
    const useGuestCoffee = isGuestCoffee && stats.guest_coffees > 0 && 
      stats.guest_expires_at && new Date(stats.guest_expires_at) > new Date();

    if (useGuestCoffee) {
      // ===== GUEST COFFEE REDEMPTION =====
      const { data: grant } = await supabase
        .from('guest_grants').select('inviter_user_id')
        .eq('invitee_user_id', userId).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      let inviterPublicId = '???';
      if (grant?.inviter_user_id) {
        const { data: inviterProfile } = await supabase
          .from('profiles').select('public_id').eq('user_id', grant.inviter_user_id).maybeSingle();
        if (inviterProfile?.public_id) inviterPublicId = inviterProfile.public_id;
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
          drink_name: `Гостевой кофе от ID:${inviterPublicId}`,
          drink_type: 'coffee', subscription_name: 'Гостевой доступ',
        }),
      ]);

      if (updateResult.error) {
        return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (stats.guest_coffees - 1 <= 0 && grant) {
        supabase.from('guest_grants').update({ status: 'consumed' })
          .eq('invitee_user_id', userId).eq('status', 'active').then(() => {});
      }

      return new Response(JSON.stringify({
        success: true, customerName: profile?.name || 'Клиент',
        drinkName: 'Гостевой кофе', remaining: stats.guest_coffees - 1,
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
      .select(`id, expires_at, subscription_types ( daily_limit, type, name )`)
      .eq('user_id', userId).eq('is_active', true);

    interface SubTypeInfo { daily_limit: number | null; type: string; name: string; }
    
    const matchingSub = subscriptions?.find(s => {
      const st = s.subscription_types as unknown as SubTypeInfo | null;
      return st && st.type === drinkType;
    });
    const subTypes = matchingSub?.subscription_types as unknown as SubTypeInfo | null;
    
    if (subTypes && subTypes.daily_limit !== null) {
      const { count: todayCount } = await supabase
        .from('redemptions').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('drink_type', drinkType)
        .gte('redeemed_at', `${today}T00:00:00`).lt('redeemed_at', `${today}T23:59:59.999`);

      if ((todayCount || 0) >= subTypes.daily_limit) {
        return new Response(JSON.stringify({ 
          error: `Дневной лимит исчерпан (${subTypes.daily_limit} в день)`, dailyLimitReached: true 
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
        drink_name: drinkName, drink_type: drinkType, subscription_name: subscriptionName,
      }),
    ]);

    if (updateResult.error) {
      return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const newRemaining = drinkType === 'coffee' ? newStats.coffee_remaining : newStats.drinks_remaining;

    // If remaining hits 0, deactivate the subscription
    if (newRemaining <= 0 && matchingSub) {
      supabase.from('user_subscriptions')
        .update({ is_active: false })
        .eq('id', matchingSub.id)
        .then(({ error: deactivateError }) => {
          if (deactivateError) {
            console.error('Error deactivating subscription:', deactivateError);
          } else {
            console.log(`Subscription ${matchingSub.id} deactivated: ${drinkType} remaining = 0`);
          }
        });
    }

    // Fire-and-forget: low balance & expiry notifications
    if (profile?.phone) {
      const telegramId = extractTelegramId(profile.phone);
      if (telegramId) {
        const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (telegramBotToken) {
          const subName = subscriptionName || (drinkType === 'coffee' ? 'Кофе' : 'Ланч');
          
          // Subscription exhausted notification
          if (newRemaining <= 0) {
            const exhaustedUnit = drinkType === 'coffee' ? 'напитки' : 'ланчи';
            sendTelegramMessage(telegramId, `📋 Ваши ${exhaustedUnit} по подписке ${subName} закончились. Подписка деактивирована. Оформите новую подписку! ☕`, telegramBotToken);
          }
          
          // Low balance notification (only at exactly 5 or 2 remaining)
          if (newRemaining === 5 || newRemaining === 2) {
            const unitWord = drinkType === 'coffee'
              ? (newRemaining === 2 ? 'напитка' : 'напитков')
              : (newRemaining === 2 ? 'ланча' : 'ланчей');
            sendTelegramMessage(telegramId, `⚠️ У вас осталось ${newRemaining} ${unitWord} по подписке ${subName}`, telegramBotToken);
          }

          // Expiry notification (only at exactly 5 or 2 days left)
          if (matchingSub?.expires_at) {
            const expiresAt = new Date(matchingSub.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (daysLeft === 5 || daysLeft === 2) {
              const daysWord = daysLeft === 2 ? 'дня' : 'дней';
              sendTelegramMessage(telegramId, `⚠️ У вас осталось ${daysLeft} ${daysWord} до окончания подписки ${subName}`, telegramBotToken);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true, customerName: profile?.name || 'Клиент',
      drinkName, remaining: newRemaining,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
