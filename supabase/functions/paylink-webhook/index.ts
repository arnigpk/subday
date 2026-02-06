import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload = await req.json();
    console.log('PayLink webhook received:', JSON.stringify(payload));

    const { order_id, status, payment_id, amount } = payload;

    if (!order_id) {
      console.error('Missing order_id in webhook');
      return new Response(JSON.stringify({ error: 'Missing order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the order
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .select('*, subscription_types(*)')
      .eq('order_id', order_id)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', order_id, orderError);
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing order ${order_id}, status: ${status}, current: ${order.status}`);

    // Check if already processed
    if (order.status === 'paid') {
      console.log('Order already processed');
      return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map PayLink status to our status
    // PayLink statuses: success, failed, pending, cancelled
    const mappedStatus = status === 'success' ? 'paid' : 
                         status === 'failed' ? 'failed' : 
                         status === 'cancelled' ? 'cancelled' : 'pending';

    // Update order status
    const { error: updateError } = await supabase
      .from('payment_orders')
      .update({ 
        status: mappedStatus,
        payment_id: payment_id || order.payment_id,
        paid_at: mappedStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update order' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If payment successful, activate subscription
    if (mappedStatus === 'paid') {
      console.log(`Activating subscription for user ${order.user_id}`);

      // Call activate_subscription function
      const { data: activationResult, error: activationError } = await supabase
        .rpc('activate_subscription', {
          _user_id: order.user_id,
          _subscription_type_id: order.subscription_type_id,
        });

      if (activationError) {
        console.error('Subscription activation failed:', activationError);
        return new Response(JSON.stringify({ error: 'Subscription activation failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Subscription activated:', activationResult);

      // Record in subscription_transactions table
      const subType = order.subscription_types;
      const { error: txError } = await supabase
        .from('subscription_transactions')
        .insert({
          user_id: order.user_id,
          subscription_type_id: order.subscription_type_id,
          subscription_name: subType?.name || order.metadata?.subscription_name,
          amount: order.amount,
          transaction_type: 'purchase',
          payment_method: 'paylink',
          payment_order_id: order.id,
        });

      if (txError) {
        console.error('Failed to record transaction:', txError);
        // Don't fail the webhook, subscription is already activated
      }

      // Send notification (optional)
      try {
        await supabase.functions.invoke('send-subscription-notification', {
          body: {
            userId: order.user_id,
            subscriptionName: subType?.name || order.metadata?.subscription_name,
            action: 'purchased',
          },
        });
      } catch (notifyError) {
        console.error('Notification failed:', notifyError);
        // Don't fail the webhook
      }

      console.log('Payment processed successfully');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
