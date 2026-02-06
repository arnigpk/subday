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
    const paylinkSecretKey = Deno.env.get('PAYLINK_API_KEY')!;
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
    // Amount in tenge (PayLink expects amount in minimal units - tiyn, so multiply by 100)
    const amountInTenge = subType.price;
    const amountInTiyn = amountInTenge * 100;

    // Get return URL (app home page)
    const returnUrl = `${req.headers.get('origin') || 'https://vhod.lovable.app'}/`;
    const webhookUrl = `${supabaseUrl}/functions/v1/paylink-webhook`;

    console.log(`Order ID: ${orderId}, Amount: ${amountInTenge} KZT (${amountInTiyn} tiyn), Return URL: ${returnUrl}`);

    // Create payment order in database first
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        subscription_type_id: subscriptionTypeId,
        amount: amountInTenge,
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

    // Use static X-API-KEY provided by PayLink for test/production
    console.log(`PayLink auth: shop_id=${paylinkShopId}, using static API key`);

    // Create payment via PayLink API v3
    // Docs: https://docs.paylink.kz/en/using_api/api_v3/
    const paylinkPayload = {
      request: {
        shop_id: parseInt(paylinkShopId),
        amount: amountInTiyn, // Amount in minimal units (tiyn)
        currency: 'KZT',
        description: subType.name, // Subscription name as order description
        order_id: orderId,
        return_url: returnUrl,
        callback_url: webhookUrl,
        test: true, // Test mode
        payer_commission: 0, // No commission for customer
      },
    };

    console.log('PayLink request payload:', JSON.stringify(paylinkPayload));

    const paylinkResponse = await fetch('https://gateway.paylink.kz/transactions/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': dynamicApiKey,
        'X-API-Version': '3',
      },
      body: JSON.stringify(paylinkPayload),
    });

    const responseText = await paylinkResponse.text();
    console.log('PayLink raw response:', responseText);

    // Handle non-OK responses
    if (!paylinkResponse.ok) {
      console.error('PayLink HTTP error:', paylinkResponse.status, responseText);
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', metadata: { ...order.metadata, error: responseText } })
        .eq('id', order.id);

      return new Response(JSON.stringify({ 
        error: 'Payment gateway error',
        details: responseText.substring(0, 500),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let paylinkData;
    try {
      paylinkData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse PayLink response:', responseText);
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', metadata: { ...order.metadata, error: responseText } })
        .eq('id', order.id);

      return new Response(JSON.stringify({ 
        error: 'Payment gateway returned invalid response',
        details: responseText.substring(0, 200),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('PayLink parsed response:', JSON.stringify(paylinkData));

    // Check for successful response
    // PayLink v3 returns redirect_url for payment page
    const redirectUrl = paylinkData.redirect_url || paylinkData.response?.redirect_url;
    const paymentUid = paylinkData.uid || paylinkData.response?.uid;

    if (!redirectUrl) {
      console.error('PayLink error - no redirect_url:', paylinkData);
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', metadata: { ...order.metadata, error: paylinkData } })
        .eq('id', order.id);

      return new Response(JSON.stringify({ 
        error: 'Payment creation failed', 
        details: paylinkData.message || paylinkData.friendly_message || 'No redirect URL returned',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order with payment URL and UID
    await supabase
      .from('payment_orders')
      .update({ 
        payment_url: redirectUrl,
        payment_id: paymentUid,
      })
      .eq('id', order.id);

    console.log('Payment created successfully:', redirectUrl);

    return new Response(JSON.stringify({
      success: true,
      paymentUrl: redirectUrl,
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
