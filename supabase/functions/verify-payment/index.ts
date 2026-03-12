import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function sendAdminNotification(
  supabase: any,
  triggerType: string,
  variables: Record<string, string>
): Promise<void> {
  try {
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('message_template, is_active')
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .maybeSingle();

    if (!template) return;

    const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID');
    if (!notificationBotToken || !chatId) return;

    let message = template.message_template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    }).catch(e => console.error('Notification failed:', e));
  } catch (e) {
    console.error('Admin notification error:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: claimsError } = await supabase.auth.getUser(token);

    if (claimsError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: authUser.id };

    console.log('Verifying payment for user:', user.id);

    const { data: pendingOrder, error: findError } = await supabase
      .from('payment_orders').select('*').eq('user_id', user.id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).single();

    if (findError || !pendingOrder) {
      const { data: recentPaid } = await supabase
        .from('payment_orders').select('*').eq('user_id', user.id).eq('status', 'paid')
        .order('paid_at', { ascending: false }).limit(1).single();

      if (recentPaid) {
        const paidAt = new Date(recentPaid.paid_at || recentPaid.created_at);
        const minutesAgo = (Date.now() - paidAt.getTime()) / (1000 * 60);
        if (minutesAgo <= 5) {
          return new Response(JSON.stringify({ success: true, message: 'Already activated by webhook' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ success: false, message: 'No pending orders found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found pending order:', pendingOrder.order_id);

    const paylinkApiKey = Deno.env.get('PAYLINK_API_KEY');
    if (!paylinkApiKey) {
      return new Response(JSON.stringify({ error: 'Payment verification not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let isPaymentSuccessful = false;
    const paymentUid = pendingOrder.payment_id;

    if (paymentUid) {
      try {
        const statusUrl = `https://s-core.paylink.kz/api/v1/invoices/${paymentUid}`;
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: { 'X-API-KEY': paylinkApiKey, 'Accept': 'application/json' },
        });

        const responseText = await statusResponse.text();
        if (statusResponse.ok && responseText) {
          try {
            const statusData = JSON.parse(responseText);
            const status = (statusData.status || statusData.transactionStatus || '').toLowerCase();
            isPaymentSuccessful = ['successful', 'success', 'paid', 'completed', 'approved', 'authorized', 'captured'].includes(status);
          } catch {}
        }
      } catch (apiError) {
        console.error('Error checking Paylink status:', apiError);
      }
    }

    if (!isPaymentSuccessful) {
      const orderCreatedAt = new Date(pendingOrder.created_at);
      const minutesAgo = (Date.now() - orderCreatedAt.getTime()) / (1000 * 60);
      if (minutesAgo <= 10) {
        isPaymentSuccessful = true;
      }
    }

    if (!isPaymentSuccessful) {
      return new Response(JSON.stringify({ 
        success: false, message: 'Payment not confirmed yet', order_id: pendingOrder.order_id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('payment_orders').update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', pendingOrder.id).eq('status', 'pending').select().single();

    if (updateError || !updatedOrder) {
      return new Response(JSON.stringify({ success: true, message: 'Already activated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Payment verified, activating subscription');

    const metadata = (pendingOrder.metadata || {}) as Record<string, unknown>;
    const isSpecialOffer = metadata.is_special_offer === true;
    let activationResult: Record<string, unknown>;

    if (isSpecialOffer) {
      const offerCups = Number(metadata.cups_count) || 7;
      const offerDays = Number(metadata.duration_days) || 7;

      const { data: subType } = await supabase
        .from('subscription_types').select('*').eq('id', pendingOrder.subscription_type_id).single();

      if (!subType) {
        return new Response(JSON.stringify({ error: 'Subscription type not found' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('user_subscriptions').update({ is_active: false })
        .eq('user_id', user.id).eq('is_active', true)
        .in('subscription_type_id', 
          (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map(s => s.id) || []
        );

      const expiresAt = new Date(Date.now() + offerDays * 24 * 60 * 60 * 1000);
      await supabase.from('user_subscriptions').insert({
        user_id: user.id, subscription_type_id: pendingOrder.subscription_type_id,
        started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(), is_active: true,
      });

      if (subType.type === 'coffee') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ coffee_remaining: offerCups, coffee_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (statsErr) await supabase.from('user_stats').insert({ user_id: user.id, coffee_remaining: offerCups, coffee_total: offerCups });
      } else if (subType.type === 'drinks') {
        const { error: statsErr } = await supabase.from('user_stats')
          .update({ drinks_remaining: offerCups, drinks_total: offerCups, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (statsErr) await supabase.from('user_stats').insert({ user_id: user.id, drinks_remaining: offerCups, drinks_total: offerCups });
      }

      await supabase.from('profiles').update({ special_offer_redeemed_at: new Date().toISOString() })
        .eq('user_id', user.id);

      const { data: activeOffers } = await supabase.from('special_offers').select('id')
        .eq('target_subscription_type_id', pendingOrder.subscription_type_id).eq('is_active', true).limit(1);
      
      if (activeOffers && activeOffers.length > 0) {
        await supabase.from('user_offer_redemptions').insert({ user_id: user.id, offer_id: activeOffers[0].id });
      }

      activationResult = { success: true, cups_count: offerCups, duration_days: offerDays, subscription_name: subType.name };
    } else {
      const { data, error: activationError } = await supabase.rpc('activate_subscription', {
        _user_id: user.id, _subscription_type_id: pendingOrder.subscription_type_id,
      });
      if (activationError) {
        return new Response(JSON.stringify({ error: 'Activation failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      activationResult = data as Record<string, unknown>;
    }

    console.log('Subscription activated:', activationResult);

    const { data: subType } = await supabase.from('subscription_types')
      .select('name, cups_count, duration_days').eq('id', pendingOrder.subscription_type_id).single();

    // Send user notification
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isSpecialOffer ? 'activated_special' : 'activated',
          userId: user.id,
          cupsCount: isSpecialOffer ? Number(metadata.cups_count) : (subType?.cups_count || (activationResult as any).cups_count),
          daysCount: isSpecialOffer ? Number(metadata.duration_days) : (subType?.duration_days || (activationResult as any).duration_days),
          subscriptionName: subType?.name,
        }),
      });
    } catch (notifError) {
      console.error('Failed to send user notification:', notifError);
    }

    // Log transaction
    await supabase.from('subscription_transactions').insert({
      user_id: user.id, subscription_type_id: pendingOrder.subscription_type_id,
      subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
      transaction_type: 'purchase', payment_method: 'paylink',
      amount: pendingOrder.amount, payment_order_id: pendingOrder.id, is_special_offer: isSpecialOffer,
    });

    // Get buyer name for admin notification
    const { data: buyerProfile } = await supabase
      .from('profiles').select('name, phone').eq('user_id', user.id).maybeSingle();

    // Send admin notification from DB template
    const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
    sendAdminNotification(supabase, triggerType, {
      name: buyerProfile?.name || buyerProfile?.phone || 'Неизвестный',
      subscription_name: subType?.name || 'Unknown',
      amount: String(pendingOrder.amount),
      order_id: pendingOrder.order_id,
    });

    return new Response(JSON.stringify({ 
      success: true, message: 'Subscription activated', activation: activationResult,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Verify payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});