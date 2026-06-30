import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Find preorders still "new" and older than 3 hours
    const { data: expiredPreorders, error: fetchErr } = await supabase
      .from('preorders')
      .select('id, user_id')
      .eq('status', 'new')
      .eq('qr_scanned', false)
      .lt('created_at', threeHoursAgo);

    if (fetchErr) {
      console.error('Error fetching expired preorders:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      // Mark as expired
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

      // Determine which counter to refund based on active subscription
      const { data: activeSub } = await supabase
        .from('user_subscriptions')
        .select('subscription_type_id, subscription_types(type)')
        .eq('user_id', preorder.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const subType = (activeSub as any)?.subscription_types?.type || 'coffee';
      const field = subType === 'drinks' ? 'drinks_remaining' : 'coffee_remaining';

      const { data: stats } = await supabase
        .from('user_stats')
        .select(field)
        .eq('user_id', preorder.user_id)
        .maybeSingle();

      if (stats) {
        const currentValue = (stats as any)[field] || 0;
        const { error: refErr } = await supabase
          .from('user_stats')
          .update({ [field]: currentValue + 1, updated_at: new Date().toISOString() })
          .eq('user_id', preorder.user_id);

        if (!refErr) {
          refundedCount++;
          console.log(`Refunded 1 ${field} to user ${preorder.user_id}`);
        } else {
          console.error(`Refund error for ${preorder.user_id}:`, refErr);
        }
      }
    }

    console.log(`Expired: ${expiredCount}, Refunded: ${refundedCount}`);

    return new Response(JSON.stringify({
      success: true, expired: expiredCount, refunded: refundedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('expire-preorders error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
