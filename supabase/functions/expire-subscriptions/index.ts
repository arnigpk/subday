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
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    console.log('Running subscription expiration check...');

    // Only send "subscription_expired" notifications if an active template
    // is configured in Admin → Автоуведомления — otherwise this would fire
    // a hardcoded message with no way to disable it from the admin panel.
    const { data: expiredTemplates } = await supabase
      .from('auto_notification_templates')
      .select('id')
      .eq('trigger_type', 'subscription_expired')
      .eq('is_active', true)
      .limit(1);
    const notifyOnExpire = (expiredTemplates || []).length > 0;

    // Fetch subscriptions about to be expired BEFORE the RPC runs
    const { data: toExpire } = await supabase
      .from('user_subscriptions')
      .select('user_id, subscription_types(name, type)')
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .lte('expires_at', new Date().toISOString());

    // Auto-unfreeze subscriptions whose freeze period has ended. expires_at was
    // already extended at freeze time, so the remaining paid time is preserved.
    const { error: unfreezeError } = await supabase
      .from('user_subscriptions')
      .update({ is_frozen: false, frozen_at: null, freeze_until: null })
      .eq('is_frozen', true)
      .lte('freeze_until', new Date().toISOString());
    if (unfreezeError) console.error('Auto-unfreeze error:', unfreezeError);

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
    let notifiedCount = 0;
    if (notifyOnExpire) {
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
        notifiedCount++;
      }
    }

    console.log(`Subscription expiration check completed. Notified ${notifiedCount} users.`);

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
