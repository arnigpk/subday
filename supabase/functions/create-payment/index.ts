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
    const paylinkApiKey = Deno.env.get('PAYLINK_API_KEY')!;
    const paylinkShopId = Deno.env.get('PAYLINK_SHOP_ID')!;

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData.user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;
    const { subscriptionTypeId } = await req.json();

    if (!subscriptionTypeId) {
      return new Response(JSON.stringify({ error: 'subscriptionTypeId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Creating payment for user ${userId}, subscription ${subscriptionTypeId}`);

    // Get subscription type details
    const { data: subType, error: subError } = await supabase
      .from('subscription_types')
      .select('*')
      .eq('id', subscriptionTypeId)
      .eq('is_active', true)
      .single();

    if (subError || !subType) {
      console.error('Subscription type error:', subError);
      return new Response(JSON.stringify({ error: 'Subscription type not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique order ID
    const orderId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const amount = subType.price;

    // Get return URL (app home page)
    const returnUrl = `${req.headers.get('origin') || 'https://vhod.lovable.app'}/`;
    const webhookUrl = `${supabaseUrl}/functions/v1/paylink-webhook`;

    console.log(`Order ID: ${orderId}, Amount: ${amount}, Return URL: ${returnUrl}`);

    // Create payment order in database first
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        subscription_type_id: subscriptionTypeId,
        amount: amount,
        order_id: orderId,
        status: 'pending',
        metadata: {
          subscription_name: subType.name,
          subscription_type: subType.type,
          cups_count: subType.cups_count,
        },
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create payment via PayLink API
    const paylinkPayload = {
      shop_id: paylinkShopId,
      amount: amount,
      order_id: orderId,
      description: subType.name, // Subscription name as order description
      return_url: returnUrl,
      callback_url: webhookUrl,
      test_mode: true, // Test mode
      // No commission for customer
      payer_commission: 0,
    };

    console.log('PayLink request payload:', JSON.stringify(paylinkPayload));

    const paylinkResponse = await fetch('https://api.paylink.kz/api/v1/payments/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': paylinkApiKey,
      },
      body: JSON.stringify(paylinkPayload),
    });

    const paylinkData = await paylinkResponse.json();
    console.log('PayLink response:', JSON.stringify(paylinkData));

    if (!paylinkResponse.ok || !paylinkData.success) {
      console.error('PayLink error:', paylinkData);
      // Update order status to failed
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', metadata: { ...order.metadata, error: paylinkData } })
        .eq('id', order.id);

      return new Response(JSON.stringify({ 
        error: 'Payment creation failed', 
        details: paylinkData.message || paylinkData 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order with payment URL
    await supabase
      .from('payment_orders')
      .update({ 
        payment_url: paylinkData.data?.payment_url,
        payment_id: paylinkData.data?.payment_id,
      })
      .eq('id', order.id);

    console.log('Payment created successfully:', paylinkData.data?.payment_url);

    return new Response(JSON.stringify({
      success: true,
      paymentUrl: paylinkData.data?.payment_url,
      orderId: orderId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
