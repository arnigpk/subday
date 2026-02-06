import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    const paylinkShopIdRaw = Deno.env.get('PAYLINK_SHOP_ID') || '911';
    const paylinkShopId = Number(paylinkShopIdRaw);

    if (!Number.isFinite(paylinkShopId)) {
      return new Response(JSON.stringify({ error: 'Invalid PAYLINK_SHOP_ID' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create supabase client with service role
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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
    const { data: subscriptionType, error: subError } = await supabaseClient
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

    // Generate unique order ID with subscription name
    const cleanName = subscriptionType.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 20);
    const orderId = `${cleanName}_${Date.now()}`;

    // Create payment order in database first
    const { data: paymentOrder, error: orderError } = await supabaseClient
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

    // Get user profile for contact info
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('phone, name')
      .eq('user_id', user.id)
      .single();

    // Clean phone number
    const cleanPhone = profile?.phone?.replace(/\D/g, '') || '';
    const formattedPhone = cleanPhone.startsWith('7') ? cleanPhone : `7${cleanPhone}`;

    // Convert amount to minor units (tiyns) - multiply by 100
    const amountInMinorUnits = Math.round(subscriptionType.price * 100);

    // s-core.paylink.kz API — endpoint /api/v1/invoices

    const paylinkHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': paylinkApiKey,
    };

    const paylinkEndpoint = 'https://s-core.paylink.kz/api/v1/invoices';

    // Generate unique requestId (UUID format)
    const requestId = crypto.randomUUID();
    
    // Customer name parsing
    const customerName = profile?.name || 'Клиент';
    const nameParts = customerName.split(' ');
    const firstName = nameParts[0] || 'Клиент';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Payload format per Paylink documentation
    const paylinkPayload = {
      amount: subscriptionType.price * 100, // in tiyns (minor units)
      currency: 'KZT',
      requestId: requestId,
      trackingId: orderId,
      description: `Подписка: ${subscriptionType.name}`,
      callbackUrl: `${supabaseUrl}/functions/v1/paylink-webhook`,
      successUrl: 'https://vhod.lovable.app/?payment=success',
      failureUrl: 'https://vhod.lovable.app/?payment=failed',
      customFields: {
        user_id: user.id,
        subscription_type_id: subscription_type_id,
        payment_order_id: paymentOrder.id,
      },
      customer: {
        id: user.id,
        firstName: firstName,
        lastName: lastName,
        phone: formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`,
        email: user.email || `user_${user.id.substring(0, 8)}@subday.app`,
        language: 'RU',
      },
      transactionType: 'AUTHORIZATION',
      doTokenize: false,
    };

    console.log('Creating Paylink payment (s-core):', JSON.stringify(paylinkPayload, null, 2));

    const paylinkResponse = await fetch(paylinkEndpoint, {
      method: 'POST',
      headers: paylinkHeaders,
      body: JSON.stringify(paylinkPayload),
    });

    const responseText = await paylinkResponse.text();
    console.log('Paylink HTTP status:', paylinkResponse.status);
    console.log('Paylink response headers:', JSON.stringify(Object.fromEntries(paylinkResponse.headers.entries())));
    console.log('Paylink raw response:', responseText || '(empty body)');

    let paylinkData;
    try {
      paylinkData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Paylink response:', responseText);
      
      await supabaseClient
        .from('payment_orders')
        .update({ status: 'failed' })
        .eq('id', paymentOrder.id);

      return new Response(JSON.stringify({ 
        error: 'Invalid response from payment provider',
        details: responseText.substring(0, 200)
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Paylink parsed response:', JSON.stringify(paylinkData, null, 2));

    if (!paylinkResponse.ok || paylinkData.error || paylinkData.errors) {
      console.error('Paylink error:', paylinkData);
      
      // Update order status to failed
      await supabaseClient
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

    // Extract payment URL/id from Checkout API response
    const paymentUrl = paylinkData.checkout?.redirect_url ||
                       paylinkData.redirect_url ||
                       paylinkData.pay_url ||
                       paylinkData.url ||
                       paylinkData.response?.redirect_url ||
                       paylinkData.response?.pay_url ||
                       paylinkData.checkout_url;

    const paymentId = paylinkData.checkout?.id ||
                      paylinkData.checkout?.token ||
                      paylinkData.id ||
                      paylinkData.payment_id ||
                      paylinkData.checkout_id ||
                      paylinkData.response?.id;

    if (!paymentUrl) {
      console.error('No payment URL in response:', paylinkData);
      
      await supabaseClient
        .from('payment_orders')
        .update({ status: 'failed' })
        .eq('id', paymentOrder.id);

      return new Response(JSON.stringify({ 
        error: 'No payment URL received',
        response: paylinkData
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order with payment URL and ID
    await supabaseClient
      .from('payment_orders')
      .update({ 
        payment_url: paymentUrl,
        payment_id: String(paymentId || ''),
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
