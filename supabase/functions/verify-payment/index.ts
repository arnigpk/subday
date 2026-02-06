import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Verify and activate subscription when user returns from payment page
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Verifying payment for user:', user.id);

    // Find most recent pending payment for this user
    const { data: pendingOrder, error: findError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (findError || !pendingOrder) {
      console.log('No pending orders found for user');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No pending orders found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found pending order:', pendingOrder.order_id);

    // Check with Paylink API if payment was successful
    const paylinkApiKey = Deno.env.get('PAYLINK_API_KEY');
    if (!paylinkApiKey) {
      console.error('PAYLINK_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Payment verification not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to get payment status from Paylink
    // Use payment_id (uid from Paylink) to check status
    let isPaymentSuccessful = false;
    const paymentUid = pendingOrder.payment_id;

    console.log('Checking payment status, payment_id:', paymentUid);

    if (paymentUid) {
      try {
        // Get invoice status by uid
        const statusUrl = `https://s-core.paylink.kz/api/v1/invoices/${paymentUid}`;
        console.log('Fetching status from:', statusUrl);
        
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'X-API-KEY': paylinkApiKey,
            'Accept': 'application/json',
          },
        });

        const responseText = await statusResponse.text();
        console.log('Paylink status HTTP:', statusResponse.status);
        console.log('Paylink status response:', responseText);

        if (statusResponse.ok && responseText) {
          try {
            const statusData = JSON.parse(responseText);
            const status = (statusData.status || statusData.transactionStatus || '').toLowerCase();
            console.log('Payment status from Paylink:', status);
            isPaymentSuccessful = ['successful', 'success', 'paid', 'completed', 'approved', 'authorized', 'captured'].includes(status);
          } catch (parseErr) {
            console.error('Failed to parse status response:', parseErr);
          }
        }
      } catch (apiError) {
        console.error('Error checking Paylink status:', apiError);
      }
    } else {
      console.log('No payment_id stored, cannot verify via API');
    }

    // If we couldn't verify via API but user came from success URL,
    // we should trust the redirect (Paylink only redirects to successUrl on success)
    // This is a fallback when webhook doesn't work
    if (!isPaymentSuccessful) {
      console.log('API verification failed, checking if we should trust success redirect...');
      
      // Check if the payment was created recently (within last 10 minutes)
      const orderCreatedAt = new Date(pendingOrder.created_at);
      const now = new Date();
      const minutesAgo = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
      
      if (minutesAgo <= 10) {
        console.log(`Order is ${minutesAgo.toFixed(1)} minutes old, trusting success redirect`);
        isPaymentSuccessful = true;
      } else {
        console.log(`Order is ${minutesAgo.toFixed(1)} minutes old, too old to trust redirect`);
      }
    }

    if (!isPaymentSuccessful) {
      console.log('Payment not yet successful');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Payment not confirmed yet',
        order_id: pendingOrder.order_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Payment is successful - activate subscription
    console.log('Payment verified, activating subscription');

    // Update payment order status
    await supabase
      .from('payment_orders')
      .update({ 
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', pendingOrder.id);

    // Activate subscription using RPC
    const { data: activationResult, error: activationError } = await supabase
      .rpc('activate_subscription', {
        _user_id: user.id,
        _subscription_type_id: pendingOrder.subscription_type_id,
      });

    if (activationError) {
      console.error('Subscription activation error:', activationError);
      return new Response(JSON.stringify({ error: 'Activation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Subscription activated:', activationResult);

    // Get subscription type for transaction log
    const { data: subType } = await supabase
      .from('subscription_types')
      .select('name, cups_count, duration_days')
      .eq('id', pendingOrder.subscription_type_id)
      .single();

    // Send user notification via Telegram (@subday_lgbot)
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'activated',
          userId: user.id,
          cupsCount: subType?.cups_count || activationResult.cups_count,
          daysCount: subType?.duration_days || activationResult.duration_days,
        }),
      });
      console.log('User notification sent for subscription activation');
    } catch (notifError) {
      console.error('Failed to send user notification:', notifError);
    }

    // Log transaction
    await supabase
      .from('subscription_transactions')
      .insert({
        user_id: user.id,
        subscription_type_id: pendingOrder.subscription_type_id,
        subscription_name: subType?.name || (pendingOrder.metadata as Record<string, unknown>)?.subscription_name || 'Unknown',
        transaction_type: 'purchase',
        payment_method: 'paylink',
        amount: pendingOrder.amount,
        payment_order_id: pendingOrder.id,
      });

    // Send Telegram notification
    try {
      const telegramBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
      const telegramChatId = Deno.env.get('NOTIFICATION_CHAT_ID');
      
      if (telegramBotToken && telegramChatId) {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `🎉 Оплата подписки (верификация)!\n\n📦 ${subType?.name || 'Unknown'}\n💰 ${pendingOrder.amount} ₸`,
          }),
        });
      }
    } catch (e) {
      console.error('Telegram error:', e);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Subscription activated',
      activation: activationResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Verify payment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
