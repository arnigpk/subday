import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || workerEnv["SUPABASE_URL"];
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || workerEnv["SUPABASE_SERVICE_ROLE_KEY"];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: authUser.id };

    const reqBody = await req.json();
    const { action, mode, value } = reqBody;

    if (action === "grant") {
      const message = typeof reqBody.message === "string" ? reqBody.message.slice(0, 50) : undefined;
      const rawCount = Number(reqBody.count);
      const count = Number.isFinite(rawCount) ? Math.min(50, Math.max(1, Math.floor(rawCount))) : 1;
      return await handleGrant(supabase, supabaseUrl!, serviceKey!, user.id, mode, value, message, count);
    } else if (action === "claim") {
      return await handleClaim(supabase, supabaseUrl!, serviceKey!, user.id);
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

function getMonthKey(): string {
  const now = new Date();
  const aqtau = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const year = aqtau.getUTCFullYear();
  const month = String(aqtau.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

async function sendGuestCoffeeNotification(supabaseUrl: string, serviceKey: string, inviteeUserId: string, message?: string, count: number = 1, senderName?: string) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-subscription-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "guest_coffee", userId: inviteeUserId, giftMessage: message, cupsCount: count, senderName }),
    });
  } catch (err) {
    console.error("Guest notification error:", err);
  }
}

function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}

async function sendTelegramMessage(telegramId: string, message: string, botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: "HTML" }),
    });
    const result = await response.json();
    if (!result.ok) { console.error("Telegram API error:", result); return false; }
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function handleStatus(supabase: any, userId: string) {
  const monthKey = getMonthKey();

  const { data: grant } = await supabase
    .from("guest_grants")
    .select("id")
    .eq("inviter_user_id", userId)
    .eq("month_key", monthKey)
    .maybeSingle();

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

// Helper: get inviter's active coffee subscription type id
async function getInviterSubscriptionTypeId(supabase: any, inviterId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("subscription_type_id, subscription_types (type)")
    .eq("user_id", inviterId)
    .eq("is_active", true);

  if (!data || data.length === 0) return null;

  const coffeeSub = data.find((s: any) => {
    const st = s.subscription_types;
    return st && st.type === "coffee";
  });

  return coffeeSub?.subscription_type_id || null;
}

async function handleGrant(supabase: any, supabaseUrl: string, serviceKey: string, inviterId: string, mode: string, value: string, message?: string, count: number = 1) {
  if (!mode || !value) return jsonRes({ error: "Некорректные данные" }, 400);

  const monthKey = getMonthKey();

  // 1. Check inviter has coffee + get subscription type + name in parallel
  const [inviterStatsResult, subscriptionTypeId, inviterProfileResult] = await Promise.all([
    supabase.from("user_stats").select("coffee_remaining").eq("user_id", inviterId).single(),
    getInviterSubscriptionTypeId(supabase, inviterId),
    supabase.from("profiles").select("name").eq("user_id", inviterId).maybeSingle(),
  ]);

  const inviterStats = inviterStatsResult.data;
  const senderName = (inviterProfileResult?.data?.name || "").trim() || "Друг";
  if (!inviterStats || inviterStats.coffee_remaining < count) {
    return jsonRes({ error: "Недостаточно кофе в подписке для выдачи." }, 400);
  }

  // 3. Find invitee
  let inviteeProfile: any = null;

  if (mode === "public_id") {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, public_id")
      .eq("public_id", value.trim())
      .maybeSingle();
    inviteeProfile = data;
    if (!inviteeProfile) {
      return jsonRes({ error: "Пользователь не найден. Попросите друга открыть приложение и найти свой ID в профиле." }, 400);
    }
    if (inviteeProfile.user_id === inviterId) {
      return jsonRes({ error: "Нельзя подарить кофе самому себе" }, 400);
    }
  } else if (mode === "phone") {
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

    if (!inviteeProfile) {
      // Get subscription name for history record
      let subName = "Гостевой доступ";
      if (subscriptionTypeId) {
        const { data: subType } = await supabase
          .from("subscription_types").select("name").eq("id", subscriptionTypeId).single();
        if (subType) subName = `Гостевой доступ (${subType.name})`;
      }

      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await supabase
        .from("guest_grants")
        .insert({
          inviter_user_id: inviterId,
          invitee_phone: phone,
          month_key: monthKey,
          expires_at: expiresAt,
          status: "pending",
          subscription_type_id: subscriptionTypeId,
        });

      if (insertError) {
        console.error("Insert pending grant error:", insertError);
        if (insertError.code === "23505") {
          return jsonRes({ error: "В этом месяце вы уже выдали гостевой доступ." }, 400);
        }
        return jsonRes({ error: "Ошибка создания приглашения" }, 500);
      }

      await supabase.from("redemptions").insert({
        user_id: inviterId,
        shop_name: "subday",
        shop_id: null,
        drink_name: `Гостевой доступ → ${phone}`,
        drink_type: "coffee",
        subscription_name: subName,
      });

      return jsonRes({ status: "pending" });
    }
  } else {
    return jsonRes({ error: "Некорректный режим" }, 400);
  }

  if (!inviteeProfile) {
    return jsonRes({ error: "Такого пользователя не существует, попробуй ввести правильный ID" }, 400);
  }

  if (inviteeProfile.user_id === inviterId) {
    return jsonRes({ error: "Нельзя выдать гостевой доступ самому себе." }, 400);
  }

  // No limits: any user can receive guest coffee, any number of times.
  // 6. Atomic grant via DB function — deducts `count` cups from the inviter,
  //    grant valid for 14 days.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: result, error: rpcError } = await supabase.rpc("grant_guest_access", {
    _inviter_id: inviterId,
    _invitee_id: inviteeProfile.user_id,
    _month_key: monthKey,
    _expires_at: expiresAt,
    _subscription_type_id: subscriptionTypeId,
    _count: count,
  });

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return jsonRes({ error: "Ошибка выдачи гостевого доступа" }, 500);
  }

  if (!result.success) {
    const errorMap: Record<string, string> = {
      insufficient_coffee: "Недостаточно кофе в подписке для приглашения друга.",
      already_received: "Пользователь уже попробовал subday",
    };
    return jsonRes({ error: errorMap[result.error] || "Ошибка" }, 400);
  }

  // Get subscription name for history
  let subName = "Гостевой доступ";
  if (subscriptionTypeId) {
    const { data: subType } = await supabase
      .from("subscription_types").select("name").eq("id", subscriptionTypeId).single();
    if (subType) subName = `Гостевой доступ (${subType.name})`;
  }

  // Insert history record for inviter
  const inviteeIdentifier = mode === "phone" ? value : `ID: ${value}`;
  await supabase.from("redemptions").insert({
    user_id: inviterId,
    shop_name: "subday",
    shop_id: null,
    drink_name: `Гостевой доступ → ${inviteeIdentifier}`,
    drink_type: "coffee",
    subscription_name: subName,
  });

  // Send notification to invitee (fire-and-forget)
  sendGuestCoffeeNotification(supabaseUrl, serviceKey, inviteeProfile.user_id, message, count, senderName).catch(e => console.error("Notification error:", e));

  return jsonRes({ status: "active", expires_at: result.expires_at });
}

async function handleClaim(supabase: any, supabaseUrl: string, serviceKey: string, inviteeId: string) {
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

  if (result?.success) {
    sendGuestCoffeeNotification(supabaseUrl, serviceKey, inviteeId).catch(e => console.error("Claim notification error:", e));
  }

  return jsonRes(result);
}