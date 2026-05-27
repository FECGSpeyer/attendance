// supabase/functions/delete-account/index.ts
// Deploy: supabase functions deploy delete-account
// Deletes the calling user's account: removes all tenantUsers rows, related player rows,
// device tokens, notifications row, and finally the auth user itself.
//
// Auth: requires the caller's JWT. The function derives the user from the JWT, so a user
// can only ever delete themselves — never another account.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Resolve the caller from their JWT — this is the only user we ever touch.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid token" }, 401);
    }
    const userId = userData.user.id;

    // Service-role client for the cascade.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Player rows where this user is the linked account (across all tenants).
    //    Soft-archive if there are historical attendance/handover refs we'd FK-violate;
    //    otherwise hard-delete. Simplest and irrecoverable: hard-delete + let DB cascade.
    await admin.from("player").delete().eq("appId", userId);

    // 2. Tenant memberships across all tenants.
    await admin.from("tenantUsers").delete().eq("userId", userId);

    // 3. Device tokens.
    await admin.from("device_tokens").delete().eq("user_id", userId);

    // 4. Notification config (id is the auth user id in this schema).
    await admin.from("notifications").delete().eq("id", userId);

    // 5. Finally, the auth user itself.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      return json({ error: `Auth user deletion failed: ${deleteErr.message}` }, 500);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
