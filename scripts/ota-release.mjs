// Build, zip, sign, and upload an OTA bundle to Supabase Storage.
//
// Flow:
//   1. ng build (production)            — produces www/
//   2. zip www/* into <bundleId>.zip
//   3. sign the ZIP with ota-private.pem (RSA-SHA256 over the raw bytes,
//      base64-encoded) so the device can verify it against the publicKey
//      baked into capacitor.config.json
//   4. Upload the ZIP to the `ota-bundles` bucket
//   5. Overwrite `ota-bundles/manifest.json` with
//      { bundleId, url, signature, minNativeVersion }
//
// The native app reads the manifest on launch (see LiveUpdateService) and
// downloads the bundle if its bundleId differs from the one currently active.
// The plugin verifies `signature` before activating — a tampered or
// replaced ZIP simply fails to install.
//
// Requirements:
//   • Env var SUPABASE_SERVICE_ROLE_KEY — service-role key for the project.
//     The anon key cannot write to Storage; service-role is needed only here,
//     never bundled into the app.
//   • ota-private.pem at repo root (created by scripts/ota-keygen.js).
//     .gitignored — keep it in a password manager / CI secret store.
//   • A public bucket named `ota-bundles` (see scripts/OTA.md).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/ota-release.mjs
//
// Optional flags:
//   --min-native <x.y.z>   Set manifest.minNativeVersion (default: package.json version)
//   --skip-build           Reuse existing www/ instead of re-running ng build
//
// ESM (.mjs) is required because archiver@8 ships as "type": "module" and
// only exposes the new ZipArchive class via named export.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { ZipArchive } from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const PRIVATE_KEY_PATH = path.join(ROOT, 'ota-private.pem');
const BUCKET = 'ota-bundles';
const MANIFEST_PATH = 'manifest.json';

const SUPABASE_URL = 'https://ultyjzgwejpehfjuyenr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!SERVICE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY env var is required.');
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  fail(
    `ota-private.pem not found at ${PRIVATE_KEY_PATH}.\n` +
      '   Generate one with: node scripts/ota-keygen.js',
  );
}

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const minNativeIdx = args.indexOf('--min-native');
const pkg = require(path.join(ROOT, 'package.json'));
const minNativeVersion = minNativeIdx >= 0 ? args[minNativeIdx + 1] : pkg.version;

const bundleId = `${pkg.version}-${Date.now()}`;
const zipName = `${bundleId}.zip`;
const zipPath = path.join(ROOT, zipName);

async function main() {
  if (!skipBuild) {
    console.log('▶ Building production bundle...');
    execSync('npx ng build --configuration=production', { stdio: 'inherit', cwd: ROOT });
  }
  if (!fs.existsSync(WWW)) fail(`www/ not found at ${WWW}`);

  console.log(`▶ Zipping www/ → ${zipName}`);
  await zipDir(WWW, zipPath);

  console.log('▶ Signing bundle (RSA-SHA256)...');
  const zipBytes = fs.readFileSync(zipPath);
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(zipBytes);
  signer.end();
  const signature = signer.sign(privateKey, 'base64');

  console.log('▶ Uploading bundle to Supabase Storage...');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(`bundles/${zipName}`, zipBytes, {
      contentType: 'application/zip',
      upsert: true,
    });
  if (uploadErr) fail(`Upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(`bundles/${zipName}`);
  const bundleUrl = urlData.publicUrl;

  const manifest = { bundleId, url: bundleUrl, signature, minNativeVersion };
  console.log('▶ Writing manifest:', { ...manifest, signature: signature.slice(0, 16) + '…' });
  const { error: manifestErr } = await supabase.storage
    .from(BUCKET)
    .upload(MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2)), {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '60', // 1 minute cache; manifest is small
    });
  if (manifestErr) fail(`Manifest write failed: ${manifestErr.message}`);

  fs.unlinkSync(zipPath);
  console.log(`✅ Released bundle ${bundleId}`);
  console.log(`   url: ${bundleUrl}`);
}

function zipDir(srcDir, destZip) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destZip);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(srcDir, false); // contents at root, NOT inside a www/ dir
    archive.finalize();
  });
}

main().catch(err => fail(err?.message || String(err)));
