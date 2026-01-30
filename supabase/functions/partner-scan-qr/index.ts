import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanRequest {
  userId: string;
  shopId: string;
  shopName: string;
  drinkType: 'coffee' | 'drinks';
  drinkName: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Требуется авторизация' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's token to verify auth
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the scanner's identity
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Ошибка авторизации' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scannerId = claimsData.claims.sub;

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify scanner is partner or barista for this shop
    const { data: scannerRole } = await supabase
      .from('user_roles')
      .select('role, shop_id')
      .eq('user_id', scannerId)
      .in('role', ['partner', 'barista'])
      .maybeSingle();

    if (!scannerRole) {
      return new Response(
        JSON.stringify({ error: 'У вас нет прав на сканирование' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ScanRequest = await req.json();
    const { userId, shopId, shopName, drinkType, drinkName } = body;

    console.log('Processing scan:', { userId, shopId, drinkType, drinkName, scannerId });

    // Verify shop matches scanner's shop
    if (scannerRole.shop_id !== shopId) {
      return new Response(
        JSON.stringify({ error: 'Этот QR принадлежит другой кофейне' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer stats
    const { data: stats, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (statsError || !stats) {
      console.error('Stats error:', statsError);
      return new Response(
        JSON.stringify({ error: 'Пользователь не найден' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check balance
    const remaining = drinkType === 'coffee' ? stats.coffee_remaining : stats.drinks_remaining;
    if (remaining <= 0) {
      return new Response(
        JSON.stringify({ error: 'У клиента закончились напитки' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate streak
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = stats.last_redemption_date !== today;
    
    let newStreak = stats.current_streak;
    if (isNewDay) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (stats.last_redemption_date === yesterdayStr) {
        newStreak = stats.current_streak + 1;
      } else if (!stats.last_redemption_date) {
        newStreak = 1;
      } else {
        newStreak = 1;
      }
    }

    const newMaxStreak = Math.max(newStreak, stats.max_streak);
    const bonusForRedemption = 10;

    // Update stats
    const newStats = {
      coffee_remaining: drinkType === 'coffee' ? stats.coffee_remaining - 1 : stats.coffee_remaining,
      drinks_remaining: drinkType === 'drinks' ? stats.drinks_remaining - 1 : stats.drinks_remaining,
      current_streak: newStreak,
      max_streak: newMaxStreak,
      total_cups: stats.total_cups + 1,
      bonus_points: stats.bonus_points + bonusForRedemption,
      last_redemption_date: today,
    };

    const { error: updateError } = await supabase
      .from('user_stats')
      .update(newStats)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Ошибка при списании' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert redemption record
    const { error: redemptionError } = await supabase
      .from('redemptions')
      .insert({
        user_id: userId,
        shop_name: shopName,
        shop_id: shopId,
        drink_name: drinkName,
        drink_type: drinkType,
      });

    if (redemptionError) {
      console.error('Redemption insert error:', redemptionError);
      // Don't fail the whole operation, stats are already updated
    }

    // Get customer name
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('user_id', userId)
      .maybeSingle();

    console.log('Scan successful:', { userId, drinkName, remaining: newStats.coffee_remaining + newStats.drinks_remaining });

    return new Response(
      JSON.stringify({
        success: true,
        customerName: profile?.name || 'Клиент',
        drinkName: drinkName,
        remaining: drinkType === 'coffee' ? newStats.coffee_remaining : newStats.drinks_remaining,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
