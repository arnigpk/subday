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

async function sendTelegramMessage(telegramId: string, message: string, botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: 'HTML' }),
    });
    const result = await response.json();
    if (!result.ok) { console.error('Telegram API error:', result); return false; }
    console.log('Low balance notification sent to:', telegramId);
    return true;
  } catch (error) { console.error('Error sending Telegram message:', error); return false; }
}

function calculateStreak(stats: any, today: string) {
  const isNewDay = stats.last_redemption_date !== today;
  let newStreak = stats.current_streak;
  if (isNewDay) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (stats.last_redemption_date === yesterdayStr) newStreak = stats.current_streak + 1;
    else if (!stats.last_redemption_date) newStreak = 1;
    else newStreak = 1;
  }
  return {
    newStreak,
    newMaxStreak: Math.max(newStreak, stats.max_streak),
  };
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

    const { data: scannerRole } = await supabase
      .from('user_roles').select('role, shop_id')
      .eq('user_id', scannerId).in('role', ['partner', 'barista']).maybeSingle();

    if (!scannerRole) {
      return new Response(JSON.stringify({ error: 'У вас нет прав на сканирование' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body: ScanRequest = await req.json();
    const { userId, shopId, shopName, drinkType, drinkName, isGuestCoffee } = body;

    console.log('Processing scan:', { userId, shopId, drinkType, drinkName, scannerId, isGuestCoffee });

    if (scannerRole.shop_id !== shopId) {
      return new Response(JSON.stringify({ error: 'Этот QR принадлежит другой кофейне' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check shop supports this drink type
    if (drinkType === 'drinks') {
      const { data: shop } = await supabase.from('shops').select('supported_types').eq('id', shopId).maybeSingle();
      const supportedTypes = shop?.supported_types || ['coffee'];
      if (!supportedTypes.includes('drinks')) {
        return new Response(JSON.stringify({ error: 'Эта кофейня не поддерживает ланч' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Get customer stats
    const { data: stats, error: statsError } = await supabase
      .from('user_stats').select('*').eq('user_id', userId).maybeSingle();

    if (statsError || !stats) {
      return new Response(JSON.stringify({ error: 'Пользователь не найден' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine if this is a guest coffee redemption
    const useGuestCoffee = isGuestCoffee && stats.guest_coffees > 0 && 
      stats.guest_expires_at && new Date(stats.guest_expires_at) > new Date();

    const today = new Date().toISOString().split('T')[0];
    const bonusForRedemption = 10;

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

      const { error: updateError } = await supabase
        .from('user_stats').update({
          guest_coffees: stats.guest_coffees - 1,
          current_streak: newStreak, max_streak: newMaxStreak,
          total_cups: stats.total_cups + 1, bonus_points: stats.bonus_points + bonusForRedemption,
          last_redemption_date: today,
        }).eq('user_id', userId);

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (stats.guest_coffees - 1 <= 0 && grant) {
        await supabase.from('guest_grants').update({ status: 'consumed' })
          .eq('invitee_user_id', userId).eq('status', 'active');
      }

      await supabase.from('redemptions').insert({
        user_id: userId, shop_name: shopName, shop_id: shopId,
        drink_name: `Гостевой кофе от ID:${inviterPublicId}`,
        drink_type: 'coffee', subscription_name: 'Гостевой доступ',
      });

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('user_id', userId).maybeSingle();

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

    // Check daily limit - find matching subscription (direct type or combo)
    const { data: subscriptions } = await supabase
      .from('user_subscriptions')
      .select(`id, subscription_types ( daily_limit, type, name )`)
      .eq('user_id', userId).eq('is_active', true);

    interface SubscriptionTypeInfo { daily_limit: number | null; type: string; name: string; }
    
    // Find matching subscription: exact type match
    const matchingSub = subscriptions?.find(s => {
      const subTypes = s.subscription_types as unknown as SubscriptionTypeInfo | null;
      return subTypes && subTypes.type === drinkType;
    });
    const subTypes = matchingSub?.subscription_types as unknown as SubscriptionTypeInfo | null;
    
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

    const { error: updateError } = await supabase
      .from('user_stats').update(newStats).eq('user_id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Ошибка при списании' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const subscriptionName = subTypes?.name || null;

    await supabase.from('redemptions').insert({
      user_id: userId, shop_name: shopName, shop_id: shopId,
      drink_name: drinkName, drink_type: drinkType, subscription_name: subscriptionName,
    });

    const { data: profile } = await supabase
      .from('profiles').select('name, phone').eq('user_id', userId).maybeSingle();

    // Low balance notification - triggers when remaining <= 5 OR days remaining <= 5
    const newRemaining = drinkType === 'coffee' ? newStats.coffee_remaining : newStats.drinks_remaining;
    if (profile?.phone) {
      const telegramId = extractTelegramId(profile.phone);
      if (telegramId) {
        const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (telegramBotToken) {
          // Check days remaining for the matching subscription
          const { data: sub } = await supabase
            .from('user_subscriptions').select('expires_at')
            .eq('user_id', userId).eq('is_active', true)
            .order('expires_at', { ascending: true }).limit(1).maybeSingle();
          let daysRemaining = 999;
          if (sub?.expires_at) {
            daysRemaining = Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          }
          
          // Send notification if remaining cups <= 5 OR days remaining <= 5
          if (newRemaining <= 5 || daysRemaining <= 5) {
            const message = `⚠️ У вас по подписке осталось очень мало на ${daysRemaining} дней.`;
            sendTelegramMessage(telegramId, message, telegramBotToken).catch(err => {
              console.error('Failed to send low balance notification:', err);
            });
          }
        }
      }
    }

    console.log('Scan successful:', { userId, drinkName, drinkType, remaining: newRemaining });

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
