# Password Reset (and Signup Confirmation) — Token-Hash Flow

The app processes Supabase auth email links in `src/app/app.component.ts`
(`handleAuthUrl`). It supports three link shapes, preferring the **token-hash
(OTP)** flow because — unlike PKCE — it does not depend on a `code_verifier`
stored on the requesting device. This makes recovery work even when the link is
opened on a different device or a fresh app install.

For the token-hash flow to actually be used, the Supabase **email templates**
must emit `token_hash` + `type` as query params on the app's redirect URL
(instead of the default `{{ .ConfirmationURL }}`, which routes through
Supabase's `/verify` endpoint and hands back a PKCE `code`).

## Required Supabase Dashboard changes

Dashboard → Authentication → Email Templates.

### Reset Password

Change the action link to:

```html
<a href="https://attendix.de/resetPassword?token_hash={{ .TokenHash }}&type=recovery">
  Passwort zurücksetzen
</a>
```

### Confirm signup

```html
<a href="https://attendix.de/resetPassword?token_hash={{ .TokenHash }}&type=signup">
  E-Mail-Adresse bestätigen
</a>
```

> The path can stay `resetPassword` for both; `handleAuthUrl` distinguishes
> recovery vs. signup via the `type` param. If you prefer a dedicated signup
> path, any path works as long as `type=signup` is present.

## Redirect allow-list

Dashboard → Authentication → URL Configuration → Redirect URLs must include:

```
https://attendix.de/resetPassword
```

## Notes

- `redirectTo` in `db.service.ts#resetPassword` / `auth.service.ts#resetPassword`
  stays `https://attendix.de/resetPassword`. The email template is what appends
  `token_hash` + `type`.
- The app still accepts legacy `?code=` (PKCE) and `#access_token=` (implicit)
  links as fallbacks, so links already in users' inboxes keep working.
- Native links arrive via the Capacitor `appUrlOpen` listener; web links are
  processed once at startup from `window.location` (`handleWebAuthLink`).
