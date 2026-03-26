import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const paylinkPublicKey = Deno.env.get('PAYLINK_PUBLIC_KEY')!;

    if (!paylinkPublicKey) {
      return new Response(JSON.stringify({ error: 'Payment not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: claimsError } = await supabaseClient.auth.getUser(token);

    if (claimsError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: authUser.id, email: authUser.email };

    const { subscription_type_id } = await req.json();
    if (!subscription_type_id) {
      return new Response(JSON.stringify({ error: 'subscription_type_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subscriptionType, error: subError } = await supabaseClient
      .from('subscription_types').select('*').eq('id', subscription_type_id).single();

    if (subError || !subscriptionType) {
      return new Response(JSON.stringify({ error: 'Subscription type not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for special offer eligibility
    let finalPrice = subscriptionType.price;
    let finalCups = subscriptionType.cups_count;
    let finalDays = subscriptionType.duration_days;
    let isSpecialOffer = false;

    const { data: offers } = await supabaseClient
      .from('special_offers').select('*')
      .eq('target_subscription_type_id', subscription_type_id).eq('is_active', true);

    if (offers && offers.length > 0) {
      const { data: profile } = await supabaseClient
        .from('profiles').select('created_at').eq('user_id', user.id).single();

      const { data: allRedemptions } = await supabaseClient
        .from('user_offer_redemptions').select('offer_id').eq('user_id', user.id);
      const redemptionCounts = new Map<string, number>();
      for (const r of (allRedemptions || [])) {
        redemptionCounts.set(r.offer_id, (redemptionCounts.get(r.offer_id) || 0) + 1);
      }

      const { data: activeSubs } = await supabaseClient
        .from('user_subscriptions').select('subscription_type_id, expires_at')
        .eq('user_id', user.id).eq('is_active', true);

      const now = new Date();

      for (const offer of offers) {
        const maxRedemptions = offer.max_redemptions_per_user ?? 1;
        const userRedemptions = redemptionCounts.get(offer.id) || 0;
        if (maxRedemptions > 0 && userRedemptions >= maxRedemptions) continue;

        let eligible = false;
        if (offer.eligibility_type === 'new_users') {
          if (profile) {
            const createdAt = new Date(profile.created_at);
            const eligibleUntil = new Date(createdAt.getTime() + offer.eligibility_days * 24 * 60 * 60 * 1000);
            eligible = now < eligibleUntil;
          }
        } else if (offer.eligibility_type === 'all_users') {
          eligible = true;
        } else if (offer.eligibility_type === 'no_subscription') {
          eligible = !activeSubs || activeSubs.length === 0;
        } else if (offer.eligibility_type === 'expiring_soon') {
          if (activeSubs && activeSubs.length > 0) {
            for (const sub of activeSubs) {
              if (!sub.expires_at) continue;
              const expiresAt = new Date(sub.expires_at);
              const daysLeft = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
              if (daysLeft <= 5 && daysLeft > 0) { eligible = true; break; }
            }
          }
        }

        if (eligible) {
          finalPrice = offer.offer_price;
          finalCups = offer.offer_cups_count;
          finalDays = offer.offer_duration_days;
          isSpecialOffer = true;
          console.log('Special offer applied:', { offerId: offer.id, finalPrice, finalCups, finalDays });
          break;
        }
      }
    }

    const cleanName = subscriptionType.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 20);
    const orderId = `${cleanName}_${Date.now()}`;

    const { data: paymentOrder, error: orderError } = await supabaseClient
      .from('payment_orders').insert({
        order_id: orderId,
        user_id: user.id,
        subscription_type_id: subscription_type_id,
        amount: finalPrice,
        status: 'pending',
        metadata: {
          subscription_name: subscriptionType.name,
          cups_count: finalCups,
          duration_days: finalDays,
          is_special_offer: isSpecialOffer,
        }
      }).select().single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabaseClient
      .from('profiles').select('phone, name').eq('user_id', user.id).single();

    const cleanPhone = profile?.phone?.replace(/\D/g, '') || '';
    const formattedPhone = cleanPhone.startsWith('7') ? cleanPhone : `7${cleanPhone}`;
    const customerName = profile?.name || 'Клиент';
    const nameParts = customerName.split(' ');
    const firstName = nameParts[0] || 'Клиент';
    const lastName = nameParts.slice(1).join(' ') || '';
    const requestId = crypto.randomUUID();

    // Use public API endpoint for iframe widget
    const paylinkEndpoint = 'https://core.paylink.kz/api/v1/public/invoices';

    const paylinkPayload = {
      amount: finalPrice,
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
      transactionType: 'PAYMENT',
      doTokenize: false,
    };

    console.log('Creating Paylink payment (public API):', JSON.stringify(paylinkPayload, null, 2));

    const paylinkResponse = await fetch(paylinkEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-public-token': paylinkPublicKey,
      },
      body: JSON.stringify(paylinkPayload),
    });

    const responseText = await paylinkResponse.text();
    console.log('Paylink HTTP status:', paylinkResponse.status);
    console.log('Paylink raw response:', responseText || '(empty body)');

    let paylinkData;
    try {
      paylinkData = JSON.parse(responseText);
    } catch {
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return new Response(JSON.stringify({ error: 'Invalid response from payment provider' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!paylinkResponse.ok || paylinkData.error || paylinkData.errors) {
      console.error('Paylink error:', paylinkData);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return new Response(JSON.stringify({ error: 'Payment creation failed', details: paylinkData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentUrl = paylinkData.paymentUrl || paylinkData.payment_url || paylinkData.redirect_url || paylinkData.url;
    const paymentId = paylinkData.uid || paylinkData.id || paylinkData.invoiceId;

    if (!paymentUrl) {
      console.error('No payment URL in response:', paylinkData);
      await supabaseClient.from('payment_orders').update({ status: 'failed' }).eq('id', paymentOrder.id);
      return new Response(JSON.stringify({ error: 'No payment URL received', response: paylinkData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabaseClient.from('payment_orders').update({
      payment_url: paymentUrl,
      payment_id: String(paymentId || ''),
    }).eq('id', paymentOrder.id);

    console.log('Payment created successfully, URL:', paymentUrl);

    return new Response(JSON.stringify({
      success: true,
      payment_url: paymentUrl,
      order_id: orderId,
      payment_order_id: paymentOrder.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
