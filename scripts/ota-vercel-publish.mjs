// Vercel post-build OTA publisher.
//
// Wired into Vercel via `buildCommand` (see vercel.json). Runs after
// `ng build` has produced www/, decides whether to publish an OTA bundle,
// and either delegates to scripts/ota-release.mjs or exits silently.
//
// Publish rule:
//   • VERCEL_ENV === 'production' (i.e. a production deploy of attendix.de)
//   • Otherwise: skip — preview deploys must never push to mobile users.
//
// When invoked outside Vercel (no VERCEL env var), this script is a no-op
// so a local `npm run build` doesn't accidentally publish.
//
// Required Vercel env vars (set under Settings → Environment Variables,
// scoped to Production only):
//   • SUPABASE_SERVICE_ROLE_KEY — full service-role JWT
//   • OTA_PRIVATE_KEY           — full PEM of the RSA signing key, including
//                                 the BEGIN/END lines and real newlines
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const onVercel = !!process.env.VERCEL;
const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development'

if (!onVercel) {
  console.log('[ota] Not running on Vercel — skipping OTA publish.');
  process.exit(0);
}

if (env !== 'production') {
  console.log(`[ota] VERCEL_ENV=${env} — skipping OTA publish (only production deploys publish).`);
  process.exit(0);
}

console.log('[ota] Production deploy detected — publishing OTA bundle...');

const releaseScript = path.resolve(__dirname, 'ota-release.mjs');
try {
  execSync(`node "${releaseScript}" --skip-build`, { stdio: 'inherit' });
} catch (err) {
  // We deliberately swallow the error so a failed OTA publish does NOT fail
  // the Vercel deploy. The PWA at attendix.de should still go live even if
  // Supabase Storage is briefly unreachable — native users just stay on the
  // bundle they already have until the next deploy succeeds.
  console.error('[ota] OTA publish failed but Vercel deploy will continue:', err?.message || err);
  process.exit(0);
}
