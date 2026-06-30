import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || workerEnv["SUPABASE_URL"];
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || workerEnv["SUPABASE_SERVICE_ROLE_KEY"];
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const now = new Date().toISOString();

    // 1. Activate ads whose starts_at has arrived
    const { data: adsToActivate } = await supabase
      .from("subflow_ads")
      .update({ is_active: true })
      .eq("is_active", false)
      .not("starts_at", "is", null)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .select("id");

    // 2. Deactivate ads whose ends_at has passed
    const { data: adsToDeactivate } = await supabase
      .from("subflow_ads")
      .update({ is_active: false })
      .eq("is_active", true)
      .not("ends_at", "is", null)
      .lte("ends_at", now)
      .select("id");

    // 3. Activate banners whose starts_at has arrived
    const { data: bannersToActivate } = await supabase
      .from("ad_banners")
      .update({ is_active: true })
      .eq("is_active", false)
      .not("starts_at", "is", null)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .select("id");

    // 4. Deactivate banners whose ends_at has passed
    const { data: bannersToDeactivate } = await supabase
      .from("ad_banners")
      .update({ is_active: false })
      .eq("is_active", true)
      .not("ends_at", "is", null)
      .lte("ends_at", now)
      .select("id");

    const result = {
      ads_activated: adsToActivate?.length || 0,
      ads_deactivated: adsToDeactivate?.length || 0,
      banners_activated: bannersToActivate?.length || 0,
      banners_deactivated: bannersToDeactivate?.length || 0,
    };

    console.log("Expire ads result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
