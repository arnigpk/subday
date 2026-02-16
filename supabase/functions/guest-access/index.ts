import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, mode, value } = await req.json();

    if (action === "grant") {
      return await handleGrant(supabase, user.id, mode, value);
    } else if (action === "claim") {
      return await handleClaim(supabase, user.id);
    } else if (action === "status") {
      return await handleStatus(supabase, user.id);
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Guest access error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Get current month_key in Asia/Aqtau timezone
function getMonthKey(): string {
  const now = new Date();
  // Asia/Aqtau is UTC+5
  const aqtau = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const year = aqtau.getUTCFullYear();
  const month = String(aqtau.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

async function handleStatus(supabase: any, userId: string) {
  const monthKey = getMonthKey();

  // Check if user has used their monthly invite
  const { data: grant } = await supabase
    .from("guest_grants")
    .select("id")
    .eq("inviter_user_id", userId)
    .eq("month_key", monthKey)
    .maybeSingle();

  // Get user's public_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("public_id")
    .eq("user_id", userId)
    .single();

  return jsonRes({
    monthlyUsed: !!grant,
    publicId: profile?.public_id || "",
  });
}

async function handleGrant(supabase: any, inviterId: string, mode: string, value: string) {
  if (!mode || !value) return jsonRes({ error: "Некорректные данные" }, 400);

  const monthKey = getMonthKey();

  // 1. Check monthly limit
  const { data: existingGrant } = await supabase
    .from("guest_grants")
    .select("id")
    .eq("inviter_user_id", inviterId)
    .eq("month_key", monthKey)
    .maybeSingle();

  if (existingGrant) {
    return jsonRes({ error: "В этом месяце вы уже выдали гостевой доступ." }, 400);
  }

  // 2. Check inviter has coffee
  const { data: inviterStats } = await supabase
    .from("user_stats")
    .select("coffee_remaining")
    .eq("user_id", inviterId)
    .single();

  if (!inviterStats || inviterStats.coffee_remaining < 1) {
    return jsonRes({ error: "Недостаточно кофе в подписке для приглашения друга." }, 400);
  }

  // 3. Find invitee
  let inviteeProfile: any = null;

  if (mode === "public_id") {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, public_id")
      .eq("public_id", value.trim())
      .single();
    inviteeProfile = data;
  } else if (mode === "phone") {
    // Normalize phone
    let phone = value.replace(/\D/g, "");
    if (phone.length === 10) phone = "7" + phone;
    if (phone.length === 11 && phone.startsWith("8")) phone = "7" + phone.slice(1);
    if (!phone.startsWith("+")) phone = "+" + phone;

    const { data } = await supabase
      .from("profiles")
      .select("user_id, phone")
      .eq("phone", phone)
      .single();
    inviteeProfile = data;

    // If not found, check with telegram prefix
    if (!inviteeProfile) {
      // Create pending grant
      // First check if phone already has a pending/active grant
      const { data: existingPhoneGrant } = await supabase
        .from("guest_grants")
        .select("id, status")
        .eq("invitee_phone", phone)
        .maybeSingle();

      if (existingPhoneGrant) {
        return jsonRes({ error: "Пользователь уже попробовал subday" }, 400);
      }

      // Create pending grant (don't deduct coffee yet)
      const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await supabase
        .from("guest_grants")
        .insert({
          inviter_user_id: inviterId,
          invitee_phone: phone,
          month_key: monthKey,
          expires_at: expiresAt,
          status: "pending",
        });

      if (insertError) {
        console.error("Insert pending grant error:", insertError);
        if (insertError.code === "23505") {
          return jsonRes({ error: "В этом месяце вы уже выдали гостевой доступ." }, 400);
        }
        return jsonRes({ error: "Ошибка создания приглашения" }, 500);
      }

      // Insert history record for inviter (pending)
      await supabase.from("redemptions").insert({
        user_id: inviterId,
        shop_name: "subday",
        shop_id: null,
        drink_name: `Гостевой доступ → ${phone}`,
        drink_type: "coffee",
      });

      return jsonRes({ status: "pending" });
    }
  } else {
    return jsonRes({ error: "Некорректный режим" }, 400);
  }

  if (!inviteeProfile) {
    return jsonRes({ error: "Некорректный номер телефона / ID." }, 400);
  }

  // 4. Self-invite check
  if (inviteeProfile.user_id === inviterId) {
    return jsonRes({ error: "Нельзя выдать гостевой доступ самому себе." }, 400);
  }

  // 5. Check invitee ever received
  const { data: inviteeStats } = await supabase
    .from("user_stats")
    .select("guest_ever_received")
    .eq("user_id", inviteeProfile.user_id)
    .maybeSingle();

  if (inviteeStats?.guest_ever_received) {
    return jsonRes({ error: "Твой друг уже пробовал наш сервис, попробуй другой ID" }, 400);
  }

  // 5b. Check if invitee ever had a subscription
  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", inviteeProfile.user_id)
    .limit(1)
    .maybeSingle();

  if (existingSub) {
    return jsonRes({ error: "Твой друг уже пробовал наш сервис, попробуй другой ID" }, 400);
  }

  const { data: existingTx } = await supabase
    .from("subscription_transactions")
    .select("id")
    .eq("user_id", inviteeProfile.user_id)
    .limit(1)
    .maybeSingle();

  if (existingTx) {
    return jsonRes({ error: "Твой друг уже пробовал наш сервис, попробуй другой ID" }, 400);
  }

  // Check existing grant for this invitee
  const { data: existingInviteeGrant } = await supabase
    .from("guest_grants")
    .select("id")
    .eq("invitee_user_id", inviteeProfile.user_id)
    .maybeSingle();

  if (existingInviteeGrant) {
    return jsonRes({ error: "Пользователь уже попробовал subday" }, 400);
  }

  // 6. Atomic grant via DB function
  const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const { data: result, error: rpcError } = await supabase.rpc("grant_guest_access", {
    _inviter_id: inviterId,
    _invitee_id: inviteeProfile.user_id,
    _month_key: monthKey,
    _expires_at: expiresAt,
  });

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return jsonRes({ error: "Ошибка выдачи гостевого доступа" }, 500);
  }

  if (!result.success) {
    const errorMap: Record<string, string> = {
      insufficient_coffee: "Недостаточно кофе в подписке для приглашения друга.",
      already_received: "Пользователь уже попробовал subday",
      monthly_limit: "В этом месяце вы уже выдали гостевой доступ.",
    };
    return jsonRes({ error: errorMap[result.error] || "Ошибка" }, 400);
  }

  // Insert history record for inviter
  const inviteeIdentifier = mode === "phone" ? value : `ID: ${value}`;
  await supabase.from("redemptions").insert({
    user_id: inviterId,
    shop_name: "subday",
    shop_id: null,
    drink_name: `Гостевой доступ → ${inviteeIdentifier}`,
    drink_type: "coffee",
  });

  return jsonRes({ status: "active", expires_at: result.expires_at });
}

async function handleClaim(supabase: any, inviteeId: string) {
  // Get invitee's phone
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("user_id", inviteeId)
    .single();

  if (!profile?.phone) {
    return jsonRes({ success: false, reason: "no_phone" });
  }

  const { data: result, error } = await supabase.rpc("claim_pending_guest_access", {
    _invitee_id: inviteeId,
    _invitee_phone: profile.phone,
  });

  if (error) {
    console.error("Claim error:", error);
    return jsonRes({ success: false, reason: "error" });
  }

  return jsonRes(result);
}
