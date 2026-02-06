import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paylinkApiKey = Deno.env.get('PAYLINK_API_KEY')!;
    const paylinkShopId = Deno.env.get('PAYLINK_SHOP_ID') || '911';

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create supabase client with user's token
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { subscription_type_id } = await req.json();

    if (!subscription_type_id) {
      return new Response(JSON.stringify({ error: 'subscription_type_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get subscription type details
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: subscriptionType, error: subError } = await adminClient
      .from('subscription_types')
      .select('*')
      .eq('id', subscription_type_id)
      .single();

    if (subError || !subscriptionType) {
      console.error('Subscription type error:', subError);
      return new Response(JSON.stringify({ error: 'Subscription type not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique order ID
    const orderId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create payment order in database first
    const { data: paymentOrder, error: orderError } = await adminClient
      .from('payment_orders')
      .insert({
        order_id: orderId,
        user_id: user.id,
        subscription_type_id: subscription_type_id,
        amount: subscriptionType.price,
        status: 'pending',
        metadata: {
          subscription_name: subscriptionType.name,
          cups_count: subscriptionType.cups_count,
          duration_days: subscriptionType.duration_days,
        }
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

    // Get user profile for phone
    const { data: profile } = await adminClient
      .from('profiles')
      .select('phone, name')
      .eq('user_id', user.id)
      .single();

    // Create Paylink payment
    const paylinkPayload = {
      amount: subscriptionType.price,
      currency: "KZT",
      description: `Подписка ${subscriptionType.name}`,
      order_id: orderId,
      callback_url: `${supabaseUrl}/functions/v1/paylink-webhook`,
      success_url: `https://vhod.lovable.app/?payment=success`,
      failure_url: `https://vhod.lovable.app/?payment=failed`,
      back_url: `https://vhod.lovable.app/`,
      customer: {
        phone: profile?.phone?.replace(/\D/g, '') || '',
        name: profile?.name || 'Customer',
      },
      metadata: {
        user_id: user.id,
        subscription_type_id: subscription_type_id,
        order_id: orderId,
      }
    };

    console.log('Creating Paylink payment:', JSON.stringify(paylinkPayload, null, 2));

    const paylinkResponse = await fetch('https://api.paylink.kz/api/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': paylinkApiKey,
        'X-API-Version': '3',
      },
      body: JSON.stringify(paylinkPayload),
    });

    const paylinkData = await paylinkResponse.json();
    console.log('Paylink response:', JSON.stringify(paylinkData, null, 2));

    if (!paylinkResponse.ok || paylinkData.error) {
      console.error('Paylink error:', paylinkData);
      
      // Update order status to failed
      await adminClient
        .from('payment_orders')
        .update({ status: 'failed' })
        .eq('id', paymentOrder.id);

      return new Response(JSON.stringify({ 
        error: 'Payment creation failed', 
        details: paylinkData 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order with payment URL and ID
    const paymentUrl = paylinkData.pay_url || paylinkData.redirect_url || paylinkData.url;
    const paymentId = paylinkData.id || paylinkData.payment_id;

    await adminClient
      .from('payment_orders')
      .update({ 
        payment_url: paymentUrl,
        payment_id: String(paymentId),
      })
      .eq('id', paymentOrder.id);

    console.log('Payment created successfully, URL:', paymentUrl);

    return new Response(JSON.stringify({ 
      success: true,
      payment_url: paymentUrl,
      order_id: orderId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
