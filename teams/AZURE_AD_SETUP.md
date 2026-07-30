# Azure AD (Microsoft Entra) setup for Attendix Teams SSO

This is the **tenant-admin portal work** required before Microsoft SSO in the
Teams tab can work. None of it can be done from the repo. Once done, fill the
values into the Teams manifest and the Edge Function secrets (bottom of this
file).

The app uses a **custom token exchange**: the Teams tab calls `getAuthToken()`
to obtain an Entra token, and the `teams-sso` Supabase Edge Function verifies it
and links/resolves the Attendix account by the immutable Microsoft `oid`.

---

## 1. Register the application

Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.

- **Name:** `Attendix Teams SSO`
- **Supported account types:** *Accounts in this organizational directory only*
  (single tenant) — matches the internal-org distribution. Choose multi-tenant
  only if you need other tenants.
- **Redirect URI:** leave empty for now.
- Register, then copy the **Application (client) ID** — this is
  `<AZURE_AD_CLIENT_ID>` used everywhere below.

## 2. Expose an API / Application ID URI

App registration → **Expose an API**.

- **Application ID URI:** set it to `api://attendix.de/<AZURE_AD_CLIENT_ID>`
  (click *Set*, edit to this exact value). This must match `webApplicationInfo.resource`
  in the Teams manifest and `AAD_APP_ID_URI` in the Edge Function.
- **Add a scope:**
  - Scope name: `access_as_user`
  - Who can consent: *Admins and users*
  - Admin consent display name: `Access Attendix as the signed-in user`
  - Admin consent description: `Allows Teams to call Attendix on behalf of the signed-in user.`
  - State: *Enabled*

## 3. Pre-authorize the Teams client applications

Still under **Expose an API** → **Add a client application**, add each of these
Microsoft-owned Teams client IDs and check the `access_as_user` scope for each
(these are the well-known Teams/Office clients that request the SSO token):

```
1fec8e78-bce4-4aaf-ab1b-5451cc387264   Teams desktop/mobile
5e3ce6c0-2b1f-4285-8d4b-75ee78787346   Teams web
4765445b-32c6-49b0-83e6-1d93765276ca   Microsoft 365 (Office) web
0ec893e0-5785-4de6-99da-4ed124e5296c   Microsoft 365 (Office) desktop
4345a7b9-9a63-4910-a426-35363201d503   Microsoft 365 (Office) web (M365)
```

Pre-authorizing suppresses the per-user consent prompt so sign-in is silent.

## 4. API permissions (Microsoft Graph)

App registration → **API permissions**. For basic SSO the token only needs
OpenID scopes:

- Add **Microsoft Graph → Delegated →** `openid`, `profile`, `email`.
- Click **Grant admin consent for <tenant>**.

(`oid` and `tid` are present in the token from the OpenID scopes; no extra Graph
calls are needed for the linking flow.)

## 5. (Optional) Restrict to your directory

If you want to hard-limit sign-in to your own tenant, note your **Directory
(tenant) ID** (Entra ID → Overview) and set it as `AAD_ALLOWED_TENANTS` on the
Edge Function. Leave unset to accept any tenant that passes signature/audience.

---

## 6. Wire the values in

**Teams manifest** — `teams/manifest.json`, replace the placeholders:

```jsonc
"webApplicationInfo": {
  "id": "<AZURE_AD_CLIENT_ID>",
  "resource": "api://attendix.de/<AZURE_AD_CLIENT_ID>"
}
```

Then repackage: `npm run teams:package` and re-upload the zip in Teams.

**Edge Function secrets** — set before/after deploying `teams-sso`:

```bash
supabase secrets set \
  AAD_CLIENT_ID=<AZURE_AD_CLIENT_ID> \
  AAD_APP_ID_URI="api://attendix.de/<AZURE_AD_CLIENT_ID>" \
  AAD_ALLOWED_TENANTS=<optional-tenant-id-csv>

supabase functions deploy teams-sso
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are provided
to Edge Functions automatically.

**Database** — run the RPC once against the project DB:

```bash
# via the SQL editor or psql:
supabase/sql/add_get_user_id_by_msoid.sql
```

(Creates the `get_user_id_by_msoid` SECURITY DEFINER function only. It does not
create indexes on `auth.users` — that role isn't the table owner on Supabase —
so uniqueness of the oid→account link is enforced by the Edge Function's 409
guards instead.)

---

## 7. Verify

1. `curl` the function with a tampered token → `401`.
2. Open the Teams tab as a Microsoft user with no link → prompted once for
   Attendix email+password → signed in; `app_metadata.msoid` now set.
3. Reopen the tab → signed in silently (matched on `oid`), no prompt.
4. A second Microsoft account trying to link to the same Attendix user, or the
   same `oid` to a second account → `409`.
