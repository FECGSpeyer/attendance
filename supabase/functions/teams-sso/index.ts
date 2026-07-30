// supabase/functions/teams-sso/index.ts
// Deploy: supabase functions deploy teams-sso
//
// Microsoft Teams SSO via custom token exchange. Inside a Teams tab the client
// obtains an Azure AD (Entra) access token via microsoftTeams.authentication
// .getAuthToken() and POSTs it here. We verify the token against Microsoft's
// JWKS, then map the verified Entra object id (oid) to an Attendix Supabase user.
//
// Because Teams/Microsoft emails do NOT match Attendix emails, the join key is
// the immutable `oid`, stored server-side in auth.users.app_metadata.msoid. It
// lives in app_metadata (not user_metadata) so the client can never forge it via
// supabase.auth.updateUser().
//
// Two actions:
//   signin (default): body { token }. If an account is already linked to this
//     oid, mint a session (token_hash) -> { linked: true, token_hash }. Else
//     { linked: false } so the client runs the one-time linking step.
//   link: body { action:'link', token, access_token }. access_token is the
//     Supabase session the client just got by logging in with Attendix
//     email+password. We re-verify the AAD token, resolve the caller, guard
//     against an oid already linked elsewhere (409), persist msoid, then mint a
//     session -> { linked: true, token_hash }.
//
// Session minting: supabase-js admin has no "issue session" call, so we use
// admin.auth.admin.generateLink({ type:'magiclink' }) and return its hashed_token
// as token_hash; the client calls supabase.auth.verifyOtp({ token_hash,
// type:'magiclink' }) — the same machinery the app already uses in handleAuthUrl.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Azure AD app registration for Attendix. AAD_CLIENT_ID is the app (client) id;
// the token's audience is the Application ID URI api://attendix.de/<client-id>
// (or the bare client id, depending on how the scope was exposed) — accept both.
// AAD_ALLOWED_TENANTS is an optional comma-separated allow-list of directory
// (tenant) ids; empty means accept any tenant that passes signature/audience.
const AAD_CLIENT_ID = Deno.env.get("AAD_CLIENT_ID")!;
const AAD_APP_ID_URI = Deno.env.get("AAD_APP_ID_URI") ?? `api://attendix.de/${AAD_CLIENT_ID}`;
const AAD_ALLOWED_TENANTS = (Deno.env.get("AAD_ALLOWED_TENANTS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Microsoft's multi-tenant v2 signing keys. jose caches/refreshes automatically.
const JWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);

interface VerifiedIdentity {
  oid: string;
  tid: string;
  name?: string;
}

// Verifies the AAD access token's signature + audience and returns the trusted
// oid/tid. Throws on any failure (caller maps to 401).
async function verifyAadToken(token: string): Promise<VerifiedIdentity> {
  const { payload } = await jwtVerify(token, JWKS, {
    audience: [AAD_APP_ID_URI, AAD_CLIENT_ID],
    // Entra v2 issuer is https://login.microsoftonline.com/<tid>/v2.0 — we can't
    // pin a single issuer for a multi-tenant app, so validate the issuer shape
    // and (optionally) the tenant allow-list below instead of a fixed string.
  });

  const iss = String(payload.iss ?? "");
  const okIssuer = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(iss)
    || /^https:\/\/sts\.windows\.net\/[0-9a-f-]+\/$/i.test(iss);
  if (!okIssuer) {
    throw new Error(`Untrusted issuer: ${iss}`);
  }

  const oid = String(payload.oid ?? "");
  const tid = String(payload.tid ?? "");
  if (!oid) {
    throw new Error("Token missing oid");
  }
  if (AAD_ALLOWED_TENANTS.length && !AAD_ALLOWED_TENANTS.includes(tid)) {
    throw new Error(`Tenant not allowed: ${tid}`);
  }

  return { oid, tid, name: payload.name ? String(payload.name) : undefined };
}

// Issues a fresh session for an existing user (by their internal Supabase email)
// and returns the token_hash the client verifies with verifyOtp.
async function mintTokenHash(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Session minting failed: ${error?.message ?? "no hashed_token"}`);
  }
  return data.properties.hashed_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "signin";
    const token: string | undefined = body.token;
    if (!token) {
      return json({ error: "Missing token" }, 400);
    }

    // Verify the Microsoft token first — nothing else runs on an invalid token.
    let identity: VerifiedIdentity;
    try {
      identity = await verifyAadToken(token);
    } catch (e) {
      return json({ error: `Invalid token: ${(e as Error).message}` }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (action === "signin") {
      // Look up a user already linked to this Microsoft identity.
      const { data: rows, error: rpcErr } = await admin.rpc("get_user_id_by_msoid", {
        p_msoid: identity.oid,
      });
      if (rpcErr) {
        return json({ error: `Lookup failed: ${rpcErr.message}` }, 500);
      }
      const userId: string | undefined = rows?.[0]?.id;
      if (!userId) {
        // Not linked yet — client runs the one-time linking step. Not an error.
        return json({ linked: false });
      }

      const { data: userData, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !userData?.user?.email) {
        return json({ error: "Linked user not found" }, 500);
      }
      const token_hash = await mintTokenHash(admin, userData.user.email);
      return json({ linked: true, token_hash });
    }

    if (action === "link") {
      const accessToken: string | undefined = body.access_token;
      if (!accessToken) {
        return json({ error: "Missing access_token" }, 400);
      }

      // Resolve the caller from the Supabase session they just established by
      // logging in with their Attendix email+password.
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: caller, error: callerErr } = await userClient.auth.getUser();
      if (callerErr || !caller?.user) {
        return json({ error: "Invalid Supabase session" }, 401);
      }
      const callerId = caller.user.id;
      const callerEmail = caller.user.email!;

      // Guard 1: this oid must not already belong to a different account.
      const { data: existingRows, error: exErr } = await admin.rpc("get_user_id_by_msoid", {
        p_msoid: identity.oid,
      });
      if (exErr) {
        return json({ error: `Lookup failed: ${exErr.message}` }, 500);
      }
      const existingUserId: string | undefined = existingRows?.[0]?.id;
      if (existingUserId && existingUserId !== callerId) {
        return json({ error: "This Microsoft account is already linked to another Attendix user." }, 409);
      }

      // Guard 2: this account must not already be linked to a different oid.
      const existingMsoid = (caller.user.app_metadata as Record<string, unknown> | undefined)?.msoid;
      if (existingMsoid && existingMsoid !== identity.oid) {
        return json({ error: "This Attendix account is already linked to a different Microsoft account." }, 409);
      }

      // Persist the link server-side (service role — app_metadata, not user_metadata).
      const { error: updErr } = await admin.auth.admin.updateUserById(callerId, {
        app_metadata: { msoid: identity.oid },
      });
      if (updErr) {
        return json({ error: `Linking failed: ${updErr.message}` }, 500);
      }

      const token_hash = await mintTokenHash(admin, callerEmail);
      return json({ linked: true, token_hash });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
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
