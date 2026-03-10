import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    let payload: Record<string, unknown> = {};
    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);
    
    if (url.searchParams.toString()) {
      for (const [key, value] of url.searchParams.entries()) {
        payload[key] = value;
      }
    }
    
    if (req.method === 'POST') {
      try {
        const bodyText = await req.text();
        console.log('Raw body received:', bodyText || '(empty)');
        
        if (bodyText) {
          if (contentType.includes('application/json')) {
            payload = { ...payload, ...JSON.parse(bodyText) };
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = new URLSearchParams(bodyText);
            for (const [key, value] of formData.entries()) {
              payload[key] = value;
            }
          } else {
            try {
              payload = { ...payload, ...JSON.parse(bodyText) };
            } catch {
              const formData = new URLSearchParams(bodyText);
              for (const [key, value] of formData.entries()) {
                payload[key] = value;
              }
            }
          }
        }
      } catch (parseError) {
        console.log('Body parse error (non-fatal):', parseError);
      }
    }

    console.log('Paylink webhook received:', JSON.stringify(payload, null, 2));

    const orderId = payload.trackingId || 
                    payload.tracking_id || 
                    payload.order_id || 
                    (payload.customFields as Record<string, unknown>)?.payment_order_id ||
                    (payload.metadata as Record<string, unknown>)?.order_id;
    const status = payload.status || payload.payment_status || payload.transactionStatus;
    const paymentId = payload.uid || payload.id || payload.payment_id;
    const customFields = (payload.customFields || {}) as Record<string, unknown>;

    console.log('Parsed webhook data:', { orderId, status, paymentId, customFields });

    if (!orderId) {
      console.error('No order_id in webhook payload');
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: paymentOrder, error: findError } = await supabase
      .from('payment_orders').select('*').eq('order_id', orderId).single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', orderId, findError);
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (paymentOrder.status === 'paid') {
      console.log('Order already processed:', orderId);
      return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const statusLower = String(status || '').toLowerCase();
    const isSuccess = ['successful', 'success', 'paid', 'completed', 'approved', 'authorized', 'captured'].includes(statusLower);

    if (isSuccess) {
      console.log('Payment successful, activating subscription for user:', paymentOrder.user_id);

      await supabase.from('payment_orders').update({ 
        status: 'paid', paid_at: new Date().toISOString(), payment_id: String(paymentId || ''),
      }).eq('id', paymentOrder.id);

      const metadata = (paymentOrder.metadata || {}) as Record<string, unknown>;
      const isSpecialOffer = metadata.is_special_offer === true;
      let activationResult: Record<string, unknown>;
      
      if (isSpecialOffer) {
        console.log('Activating special offer subscription');
        const offerCups = Number(metadata.cups_count) || 7;
        const offerDays = Number(metadata.duration_days) || 7;

        const { data: subType } = await supabase
          .from('subscription_types').select('*').eq('id', paymentOrder.subscription_type_id).single();

        if (!subType) {
          return new Response(JSON.stringify({ error: 'Subscription type not found' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabase.from('user_subscriptions').update({ is_active: false })
          .eq('user_id', paymentOrder.user_id).eq('is_active', true)
          .in('subscription_type_id', 
            (await supabase.from('subscription_types').select('id').eq('type', subType.type)).data?.map(s => s.id) || []
          );

        const expiresAt = new Date(Date.now() + offerDays * 24 * 60 * 60 * 1000);
        await supabase.from('user_subscriptions').insert({
          user_id: paymentOrder.user_id, subscription_type_id: paymentOrder.subscription_type_id,
          started_at: new Date().toISOString(), expires_at: expiresAt.toISOString(), is_active: true,
        });

        if (subType.type === 'coffee') {
          const { error: statsErr } = await supabase.from('user_stats')
            .update({ coffee_remaining: offerCups, coffee_total: offerCups, updated_at: new Date().toISOString() })
            .eq('user_id', paymentOrder.user_id);
          if (statsErr) {
            await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, coffee_remaining: offerCups, coffee_total: offerCups });
          }
        } else if (subType.type === 'drinks') {
          const { error: statsErr } = await supabase.from('user_stats')
            .update({ drinks_remaining: offerCups, drinks_total: offerCups, updated_at: new Date().toISOString() })
            .eq('user_id', paymentOrder.user_id);
          if (statsErr) {
            await supabase.from('user_stats').insert({ user_id: paymentOrder.user_id, drinks_remaining: offerCups, drinks_total: offerCups });
          }
        }

        await supabase.from('profiles').update({ special_offer_redeemed_at: new Date().toISOString() })
          .eq('user_id', paymentOrder.user_id);

        const { data: activeOffers } = await supabase.from('special_offers').select('id')
          .eq('target_subscription_type_id', paymentOrder.subscription_type_id).eq('is_active', true).limit(1);
        
        if (activeOffers && activeOffers.length > 0) {
          await supabase.from('user_offer_redemptions').insert({ user_id: paymentOrder.user_id, offer_id: activeOffers[0].id });
        }

        activationResult = { success: true, cups_count: offerCups, duration_days: offerDays, subscription_name: subType.name };
      } else {
        const { data, error: activationError } = await supabase.rpc('activate_subscription', {
          _user_id: paymentOrder.user_id, _subscription_type_id: paymentOrder.subscription_type_id,
        });
        if (activationError) {
          console.error('Subscription activation error:', activationError);
          return new Response(JSON.stringify({ error: 'Activation failed' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        activationResult = data as Record<string, unknown>;
      }

      console.log('Subscription activated:', activationResult);

      const { data: subType } = await supabase.from('subscription_types')
        .select('name, cups_count, duration_days').eq('id', paymentOrder.subscription_type_id).single();

      // Send user notification
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'activated', userId: paymentOrder.user_id,
            cupsCount: isSpecialOffer ? Number(metadata.cups_count) : (subType?.cups_count || (activationResult as any).cups_count),
            daysCount: isSpecialOffer ? Number(metadata.duration_days) : (subType?.duration_days || (activationResult as any).duration_days),
          }),
        });
      } catch (notifError) {
        console.error('Failed to send user notification:', notifError);
      }

      // Log transaction
      await supabase.from('subscription_transactions').insert({
        user_id: paymentOrder.user_id, subscription_type_id: paymentOrder.subscription_type_id,
        subscription_name: subType?.name || metadata.subscription_name || 'Unknown',
        transaction_type: 'purchase', payment_method: 'paylink',
        amount: paymentOrder.amount, payment_order_id: paymentOrder.id, is_special_offer: isSpecialOffer,
      });

      // Send admin notification from DB template
      const triggerType = isSpecialOffer ? 'admin_payment_special' : 'admin_payment';
      sendAdminNotification(supabase, triggerType, {
        subscription_name: subType?.name || 'Unknown',
        amount: String(paymentOrder.amount),
        order_id: String(orderId),
      });

      return new Response(JSON.stringify({ 
        success: true, message: 'Subscription activated', activation: activationResult,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      console.log('Payment not successful, status:', status);
      await supabase.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);

      return new Response(JSON.stringify({ 
        success: false, message: 'Payment not successful', status,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});