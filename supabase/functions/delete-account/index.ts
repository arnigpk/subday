import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get("x-worker-env") || "{}"); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || workerEnv["SUPABASE_URL"];
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || workerEnv["SUPABASE_SERVICE_ROLE_KEY"];
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || workerEnv["SUPABASE_ANON_KEY"];

    // Verify the user with anon client
    const anonClient = createClient(supabaseUrl!, anonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Use service role client for deletions
    const adminClient = createClient(supabaseUrl!, serviceRoleKey!);

    // Delete user data from all tables in order
    const tables = [
      { table: "subflow_reactions", column: "user_id" },
      { table: "subflow_comments", column: "user_id" },
      { table: "subflow_posts", column: "user_id" },
      { table: "story_likes", column: "user_id" },
      { table: "story_views", column: "user_id" },
      { table: "stories", column: "user_id" },
      { table: "redemptions", column: "user_id" },
      { table: "guest_grants", column: "inviter_user_id" },
      { table: "guest_grants", column: "invitee_user_id" },
      { table: "payment_orders", column: "user_id" },
      { table: "subscription_transactions", column: "user_id" },
      { table: "user_subscriptions", column: "user_id" },
      { table: "user_stats", column: "user_id" },
      { table: "user_roles", column: "user_id" },
      { table: "profiles", column: "user_id" },
    ];

    for (const { table, column } of tables) {
      await adminClient.from(table).delete().eq(column, userId);
    }

    // Delete user's avatar from storage
    try {
      const { data: files } = await adminClient.storage.from("avatars").list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await adminClient.storage.from("avatars").remove(paths);
      }
    } catch {
      // Storage cleanup is best-effort
    }

    // Delete subflow images
    try {
      const { data: files } = await adminClient.storage.from("subflow-images").list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await adminClient.storage.from("subflow-images").remove(paths);
      }
    } catch {
      // Best-effort
    }

    // Finally delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
