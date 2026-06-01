import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Running subscription expiration check...');

    // Fetch subscriptions about to be expired BEFORE the RPC runs
    const { data: toExpire } = await supabase
      .from('user_subscriptions')
      .select('user_id, subscription_types(name, type)')
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date().toISOString());

    // Call the expire_subscriptions function
    const { error } = await supabase.rpc('expire_subscriptions');

    if (error) {
      console.error('Error expiring subscriptions:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Send "subscription_expired" notifications for those that just expired
    for (const sub of (toExpire || [])) {
      const st = sub.subscription_types as any;
      fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          type: 'subscription_expired',
          userId: sub.user_id,
          subscriptionName: st?.name || 'Подписка',
          drinkType: st?.type,
        }),
      }).catch(err => console.error('Expired notification error:', err));
    }

    console.log(`Subscription expiration check completed. Notified ${(toExpire || []).length} users.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Subscription expiration check completed',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Unexpected error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
