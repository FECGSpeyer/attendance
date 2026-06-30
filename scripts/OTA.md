# OTA Updates

Self-hosted, **cryptographically signed** OTA bundle delivery via [@capawesome/capacitor-live-update](https://capawesome.io/docs/sdks/capacitor/live-update/) + Supabase Storage. No Capawesome Cloud account needed.

Bundles are signed with an RSA private key that lives only on your machine / in CI. The matching public key is baked into the native app via `capacitor.config.json`. A tampered or attacker-replaced ZIP will fail signature verification and never activate.

## One-time setup

1. **Create the bucket.** In the Supabase dashboard → Storage → New bucket:
   - Name: `ota-bundles`
   - **Public** (read-only for everyone; writes require the service-role key)
2. **Install the dev dependency used by the release script:**
   ```sh
   npm i -D archiver
   ```
3. **Generate the signing keypair** (one-off):
   ```sh
   node scripts/ota-keygen.js
   ```
   This writes `ota-private.pem` (gitignored, chmod 600) and prints the matching public key.
4. **Paste the public key into `capacitor.config.json`** under `plugins.LiveUpdate.publicKey`. The script prints a ready-to-paste JSON snippet with the `\n` escapes already in place. Replace the `REPLACE_WITH_OUTPUT_OF_node_scripts_ota-keygen_js` placeholder.
5. **Back up `ota-private.pem`** to a password manager. If you lose it you cannot ship any more OTA updates to existing installs (without first releasing a new native build with a new public key).
6. **`npx cap sync`** so the new plugin config reaches both native projects, then build + ship the native app to the stores. Installs running this build are the first that can pull OTA.

## Shipping an update

```sh
# from project root
SUPABASE_SERVICE_ROLE_KEY=eyJ...service-role-key... node scripts/ota-release.mjs
```

The script:
1. Runs `ng build --configuration=production` (skip with `--skip-build`)
2. Zips `www/` → `<version>-<timestamp>.zip`
3. **Signs the ZIP** with `ota-private.pem` (RSA-SHA256 → base64)
4. Uploads the ZIP to `ota-bundles/bundles/`
5. Overwrites `ota-bundles/manifest.json` with `{ bundleId, url, signature, minNativeVersion }`

On next cold start, native apps see the new `bundleId`, download the ZIP, the plugin verifies the signature against the baked-in public key, and the user is prompted to reload.

### `--min-native` flag

By default `minNativeVersion` equals `package.json` `version`. If you're shipping a web-only fix that's safe on older shells (e.g. v4.0.6+), do:

```sh
node scripts/ota-release.mjs --min-native 4.0.6 --skip-build
```

## When OTA is NOT enough — bump native

If your change touches **any** of these, you need a real store release (not OTA):
- New native plugin / native SDK / native code
- New Capacitor permission
- Bump in `package.json` that triggers a Capacitor sync

OTA only swaps the web bundle inside the existing native shell.

## Rollback

The plugin keeps the previous bundle on disk. To roll back:
- **Manual**: Re-run `ota-release.mjs` against a known-good commit. Users will get prompted to "update" to the older bundle.
- **Automatic crash rollback**: set `LiveUpdate.readyTimeout` in `capacitor.config.json`. If the new bundle doesn't call `ready()` within N ms (e.g. the app crashes on boot), it reverts to the previous bundle on the next launch. Not enabled by default — the current code calls `ready()` immediately after the Angular app boots, so a hard crash before that is the only failure mode it catches.

## Key rotation

You normally never rotate the signing key — it just protects your CDN. But if the private key ever leaks:

1. Generate a new keypair with `node scripts/ota-keygen.js` (delete the old `ota-private.pem` first).
2. Update `publicKey` in `capacitor.config.json` with the new public key.
3. Ship a new **native** release with the new public key to the stores.
4. **Wait** for the bulk of your users to install that native release. Until they do, you cannot OTA them — bundles signed with the new key won't verify against the old shipped public key.
5. Then resume OTA releases as normal.

This is why the keygen script refuses to overwrite an existing private key — rotating is a deliberate multi-step act, not an accident.

## CI

The release script needs two secrets:
- `SUPABASE_SERVICE_ROLE_KEY` (env var)
- `ota-private.pem` at the repo root (write from a secret before invoking the script, never commit)

## Vercel auto-publish

Every **production** Vercel deploy automatically publishes an OTA bundle. Preview deploys (PRs, branch previews) never publish.

How it works:
- `package.json` exposes a `vercel-build` script: `node server.js && ng build && node scripts/ota-vercel-publish.mjs`. Vercel auto-runs `vercel-build` in preference to `build`.
- `scripts/ota-vercel-publish.mjs` inspects `VERCEL_ENV` — if it's `production`, it calls `ota-release.mjs --skip-build` (reusing the already-built `www/`). Anything else: skip.
- An OTA publish failure does NOT fail the Vercel deploy — the PWA at attendix.de still goes live; mobile users just stay on their previous bundle until the next deploy.

### Vercel env vars to set

In Vercel → Project Settings → Environment Variables, add **with scope = Production only**:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role JWT from Supabase Settings → API |
| `OTA_PRIVATE_KEY` | the full contents of `ota-private.pem` including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines |

The signing script will use `OTA_PRIVATE_KEY` when no local `ota-private.pem` is present.

**Important — scope these to Production only.** If they leak into Preview, every PR preview build can publish an OTA, which would ship unfinished code to mobile users.

### Manual local release (still works)

Local releases continue to work with the file-based key. `OTA_PRIVATE_KEY` is only a fallback when the file isn't there.

## Manifest schema

```json
{
  "bundleId":  "4.0.8-1719753600",
  "url":       "https://<project>.supabase.co/storage/v1/object/public/ota-bundles/bundles/4.0.8-1719753600.zip",
  "signature": "Yy4...base64-RSA-SHA256-of-the-zip...==",
  "minNativeVersion": "4.0.7"
}
```

`bundleId` must be unique per release — the client uses it to skip downloads it already has on disk. `signature` is verified by the plugin before the bundle is allowed to activate; an unsigned or wrongly-signed bundle is rejected.
