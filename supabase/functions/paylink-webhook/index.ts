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

    // Parse webhook payload (Paylink может прислать POST JSON или GET/FORM)
    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);

    let payload: any = null;
    let rawBody = '';

    if (req.method !== 'GET') {
      rawBody = await req.text();
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // fallback: try x-www-form-urlencoded in body
          try {
            const params = new URLSearchParams(rawBody);
            payload = Object.fromEntries(params.entries());
          } catch {
            payload = { raw: rawBody };
          }
        }
      }
    }

    // Merge query params for GET callbacks
    const queryObj = Object.fromEntries(url.searchParams.entries());
    payload = { ...(payload || {}), ...queryObj };

    console.log('Paylink webhook received:', JSON.stringify({
      method: req.method,
      contentType,
      query: queryObj,
      body: payload,
      rawBody: rawBody ? rawBody.slice(0, 1000) : undefined,
    }, null, 2));

    // Extract relevant data from Paylink callback
    const orderId =
      payload.trackingId ||
      payload.tracking_id ||
      payload.order_id ||
      payload.orderId ||
      payload.metadata?.order_id ||
      payload.metadata?.trackingId ||
      payload.metadata?.tracking_id ||
      payload.customFields?.order_id ||
      payload.customFields?.trackingId ||
      payload.customFields?.tracking_id;

    const paymentOrderId =
      payload.customFields?.payment_order_id ||
      payload.custom_fields?.payment_order_id ||
      payload.payment_order_id ||
      payload.paymentOrderId;

    const status =
      payload.status ||
      payload.payment_status ||
      payload.paymentStatus ||
      payload.state ||
      payload.result;

    const paymentId = payload.id || payload.payment_id || payload.paymentId || payload.invoiceId || payload.invoice_id;

    if (!orderId && !paymentOrderId) {
      console.error('No order identifier in webhook payload');
      return new Response(JSON.stringify({ error: 'Missing order identifier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the payment order (preferred: payment_order_id from customFields, fallback: order_id/trackingId)
    let findQuery = supabase
      .from('payment_orders')
      .select('*');

    if (paymentOrderId) {
      findQuery = findQuery.eq('id', paymentOrderId);
    } else {
      findQuery = findQuery.eq('order_id', orderId);
    }

    const { data: paymentOrder, error: findError } = await findQuery.single();

    if (findError || !paymentOrder) {
      console.error('Payment order not found:', { orderId, paymentOrderId, findError });
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

    // Check payment status (Paylink uses 'success', 'paid', 'completed', etc.)
    const isSuccess = ['success', 'paid', 'completed', 'approved'].includes(status?.toLowerCase());

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

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
