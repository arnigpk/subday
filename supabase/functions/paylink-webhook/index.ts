import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload = await req.json();
    console.log('Paylink webhook received:', JSON.stringify(payload, null, 2));

    // Extract relevant data from Paylink s-core callback
    // Paylink sends: trackingId (our order_id), status, uid (payment id), customFields
    const orderId = payload.trackingId || 
                    payload.tracking_id || 
                    payload.order_id || 
                    payload.customFields?.payment_order_id ||
                    payload.metadata?.order_id;
    const status = payload.status || payload.payment_status || payload.transactionStatus;
    const paymentId = payload.uid || payload.id || payload.payment_id;
    const customFields = payload.customFields || {};

    console.log('Parsed webhook data:', { orderId, status, paymentId, customFields });

    if (!orderId) {
      console.error('No order_id in webhook payload');
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the payment order
    const { data: paymentOrder, error: findError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', orderId, findError);
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already processed
    if (paymentOrder.status === 'paid') {
      console.log('Order already processed:', orderId);
      return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check payment status 
    // Paylink s-core uses: AUTHORIZED, CAPTURED, SUCCESS, PAID, COMPLETED, etc.
    const statusLower = (status || '').toLowerCase();
    const isSuccess = ['success', 'paid', 'completed', 'approved', 'authorized', 'captured'].includes(statusLower);

    console.log('Payment status check:', { status, statusLower, isSuccess });

    if (isSuccess) {
      console.log('Payment successful, activating subscription for user:', paymentOrder.user_id);

      // Update payment order status
      await supabase
        .from('payment_orders')
        .update({ 
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_id: String(paymentId),
        })
        .eq('id', paymentOrder.id);

      // Activate subscription using RPC
      const { data: activationResult, error: activationError } = await supabase
        .rpc('activate_subscription', {
          _user_id: paymentOrder.user_id,
          _subscription_type_id: paymentOrder.subscription_type_id,
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
        .select('name')
        .eq('id', paymentOrder.subscription_type_id)
        .single();

      // Log transaction
      const { error: transactionError } = await supabase
        .from('subscription_transactions')
        .insert({
          user_id: paymentOrder.user_id,
          subscription_type_id: paymentOrder.subscription_type_id,
          subscription_name: subType?.name || paymentOrder.metadata?.subscription_name || 'Unknown',
          transaction_type: 'purchase',
          payment_method: 'paylink',
          amount: paymentOrder.amount,
          payment_order_id: paymentOrder.id,
        });

      if (transactionError) {
        console.error('Transaction log error:', transactionError);
      }

      // Send notification to Telegram (optional)
      try {
        const telegramBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN');
        const telegramChatId = Deno.env.get('NOTIFICATION_CHAT_ID');
        
        if (telegramBotToken && telegramChatId) {
          const message = `🎉 Новая оплата подписки!\n\n` +
            `📦 Подписка: ${subType?.name || 'Unknown'}\n` +
            `💰 Сумма: ${paymentOrder.amount} ₸\n` +
            `🆔 Заказ: ${orderId}`;

          await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: message,
            }),
          });
        }
      } catch (telegramError) {
        console.error('Telegram notification error:', telegramError);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Subscription activated',
        activation: activationResult,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // Payment failed or cancelled
      console.log('Payment not successful, status:', status);
      
      await supabase
        .from('payment_orders')
        .update({ status: 'failed' })
        .eq('id', paymentOrder.id);

      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Payment not successful',
        status: status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
