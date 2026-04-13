import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Find preorders that are still "new" and older than 3 hours
    const { data: expiredPreorders, error: fetchErr } = await supabase
      .from('preorders')
      .select('id, user_id, coffee_name, syrup, shop_name')
      .eq('status', 'new')
      .eq('qr_scanned', false)
      .lt('created_at', threeHoursAgo);

    if (fetchErr) {
      console.error('Error fetching expired preorders:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!expiredPreorders || expiredPreorders.length === 0) {
      return new Response(JSON.stringify({ success: true, expired: 0, refunded: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${expiredPreorders.length} preorders to expire`);

    let expiredCount = 0;
    let refundedCount = 0;

    for (const preorder of expiredPreorders) {
      // Update status to expired
      const { error: updateErr } = await supabase
        .from('preorders')
        .update({ status: 'expired' })
        .eq('id', preorder.id)
        .eq('status', 'new');

      if (updateErr) {
        console.error(`Error expiring preorder ${preorder.id}:`, updateErr);
        continue;
      }

      expiredCount++;

      // Refund: determine drink type and return 1 cup
      // Check user's active subscription to know which counter to refund
      const { data: activeSub } = await supabase
        .from('user_subscriptions')
        .select('subscription_type_id, subscription_types!inner(type)')
        .eq('user_id', preorder.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const subType = (activeSub as any)?.subscription_types?.type || 'coffee';

      if (subType === 'coffee') {
        const { error: refundErr } = await supabase
          .from('user_stats')
          .update({ coffee_remaining: supabase.rpc ? undefined : undefined })
          .eq('user_id', preorder.user_id);

        // Use raw SQL-like increment via RPC or direct update
        const { error: incErr } = await supabase.rpc('activate_subscription', {
          _user_id: preorder.user_id,
          _subscription_type_id: activeSub?.subscription_type_id,
        });

        // Simpler approach: just increment the counter directly
        const { data: stats } = await supabase
          .from('user_stats')
          .select('coffee_remaining')
          .eq('user_id', preorder.user_id)
          .maybeSingle();

        if (stats) {
          const { error: refErr } = await supabase
            .from('user_stats')
            .update({ coffee_remaining: stats.coffee_remaining + 1, updated_at: new Date().toISOString() })
            .eq('user_id', preorder.user_id);

          if (!refErr) refundedCount++;
          else console.error(`Refund error for ${preorder.user_id}:`, refErr);
        }
      } else if (subType === 'drinks') {
        const { data: stats } = await supabase
          .from('user_stats')
          .select('drinks_remaining')
          .eq('user_id', preorder.user_id)
          .maybeSingle();

        if (stats) {
          const { error: refErr } = await supabase
            .from('user_stats')
            .update({ drinks_remaining: stats.drinks_remaining + 1, updated_at: new Date().toISOString() })
            .eq('user_id', preorder.user_id);

          if (!refErr) refundedCount++;
          else console.error(`Refund error for ${preorder.user_id}:`, refErr);
        }
      }
    }

    console.log(`Expired: ${expiredCount}, Refunded: ${refundedCount}`);

    return new Response(JSON.stringify({
      success: true,
      expired: expiredCount,
      refunded: refundedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('expire-preorders error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
