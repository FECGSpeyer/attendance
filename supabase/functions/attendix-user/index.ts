// supabase/functions/attendix-user/index.ts
// Deploy: supabase functions deploy attendix-user
// Account management + account emails for Attendix (replaces the former
// staccato-server endpoints registerAttendixUser / informAttendixUser /
// approveAttendixUser / rejectAttendixUser). Emails are sent via Resend.
//
// Actions (POST body { action, ... }):
//   register { email, name, role?, tenantId } → create auth user + "set password" mail
//   inform   { email, name, role, tenantId } → "added to instance" mail
//   approve  { email, name, role, tenantId } → "registration approved" mail
//   reject   { email, name, tenantId }       → "registration rejected" mail
//
// Auth: requires the caller's JWT. The caller must be ADMIN or RESPONSIBLE of
// the given tenant. The tenant name is loaded server-side from tenantId.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/send-email.ts";
import {
  approveEmail,
  EmailContent,
  informEmail,
  registerEmail,
  rejectEmail,
} from "../_shared/attendix-email-templates.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLE_ADMIN = 1;
const ROLE_RESPONSIBLE = 5;
const RESET_PASSWORD_URL = "https://attendix.de/resetPassword";

type Action = "register" | "inform" | "approve" | "reject";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid token" }, 401);
    }

    const body = await req.json().catch(() => null);
    const action = body?.action as Action | undefined;
    const tenantId = Number(body?.tenantId);
    const email = String(body?.email ?? "").toLowerCase().trim();
    const name = String(body?.name ?? "").trim();
    const role = String(body?.role ?? "").trim();

    if (!action || !["register", "inform", "approve", "reject"].includes(action)) {
      return json({ error: "Unknown action" }, 400);
    }
    if (!tenantId || !email || !email.includes("@")) {
      return json({ error: "Missing tenantId or email" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only admins/responsibles of the tenant may create accounts or send these mails.
    const { data: callerMembership, error: memberErr } = await admin
      .from("tenantUsers")
      .select("role")
      .eq("tenantId", tenantId)
      .eq("userId", userData.user.id)
      .in("role", [ROLE_ADMIN, ROLE_RESPONSIBLE])
      .limit(1)
      .maybeSingle();
    if (memberErr) {
      console.error("[attendix-user] membership lookup failed:", memberErr);
      return json({ error: "Membership lookup failed" }, 500);
    }
    if (!callerMembership) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("longName")
      .eq("id", tenantId)
      .single();
    if (tenantErr || !tenant) {
      return json({ error: "Tenant not found" }, 404);
    }
    const tenantName = tenant.longName as string;

    if (action === "register") {
      return await register(admin, email, name, tenantName, role);
    }

    let content: EmailContent;
    if (action === "inform") {
      content = informEmail({ name, tenant: tenantName, role });
    } else if (action === "approve") {
      content = approveEmail({ name, tenant: tenantName, role });
    } else {
      content = rejectEmail({ name, tenant: tenantName });
    }

    const mailSent = await send(email, content);
    console.log(`[attendix-user] action=${action} tenant=${tenantId} mailSent=${mailSent}`);
    return json({ mailSent });
  } catch (e) {
    console.error("[attendix-user] failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function register(
  admin: SupabaseClient,
  email: string,
  name: string,
  tenantName: string,
  role: string,
): Promise<Response> {
  // Random password that is never shared — the user sets their own via the link.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    // Account may already exist (e.g. created in parallel) → reuse it, no mail.
    const { data: existing } = await admin.rpc("get_user_id_by_email", { email });
    if (existing?.length && existing[0].id) {
      return json({ user: { id: existing[0].id }, created: false, mailSent: false });
    }
    console.error("[attendix-user] createUser failed:", createErr);
    return json({ error: createErr?.message ?? "Fehler beim Erstellen des Accounts" }, 500);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error("[attendix-user] generateLink failed:", linkErr);
    return json({ user: { id: created.user.id }, created: true, mailSent: false });
  }

  const setPasswordUrl =
    `${RESET_PASSWORD_URL}?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;
  const mailSent = await send(email, registerEmail({ name, email, setPasswordUrl, tenant: tenantName, role: role || undefined }));
  console.log(`[attendix-user] action=register mailSent=${mailSent}`);

  return json({ user: { id: created.user.id }, created: true, mailSent });
}

async function send(email: string, content: EmailContent): Promise<boolean> {
  const sent = await sendEmail({ to: [email], subject: content.subject, html: content.html });
  return sent > 0;
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
