// supabase/functions/ota-cleanup/index.ts
// Deploy: supabase functions deploy ota-cleanup
// Cron: weekly (see supabase/sql/ota_cleanup_cron.sql)
//
// Deletes old OTA bundles from the `ota-bundles` bucket. Every production
// deploy uploads a new ~15 MB ZIP to `bundles/` (scripts/ota-release.mjs) and
// nothing ever removed them, so the bucket grew to several GB.
//
// Kept:
//   - the bundle referenced by manifest.json (what every device downloads)
//   - the newest KEEP_LATEST bundles (rollback candidates / devices that read
//     the previous manifest a moment before a new release)
// Everything else under bundles/ is deleted. manifest.json is never touched.
//
// Devices never need an old ZIP again: they download the manifest URL once
// and run the bundle from local disk afterwards (LiveUpdateService).
//
// Body (optional JSON):
//   { "dryRun": true }   only report what would be deleted (default)
//   { "dryRun": false }  actually delete (the cron job sends this)
//   { "keep": 10 }       override KEEP_LATEST

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'ota-bundles';
const FOLDER = 'bundles';
const MANIFEST_PATH = 'manifest.json';
const KEEP_LATEST = 10;
const PAGE_SIZE = 1000;
const DELETE_CHUNK = 100;

interface BundleFile {
  path: string;
  createdAt: string;
  size: number;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const keepLatest = Number.isInteger(body?.keep) && body.keep >= 1 ? body.keep : KEEP_LATEST;

    // 1. Manifest: without it we can't tell which bundle is live, so abort.
    const { data: manifestBlob, error: manifestErr } = await supabase.storage
      .from(BUCKET)
      .download(MANIFEST_PATH);
    if (manifestErr || !manifestBlob) {
      throw new Error(`manifest.json not readable: ${manifestErr?.message ?? 'empty'}`);
    }
    const manifest = JSON.parse(await manifestBlob.text());
    if (!manifest?.bundleId) throw new Error('manifest.json has no bundleId');
    const liveFile = `${FOLDER}/${manifest.bundleId}.zip`;

    // 2. All bundles, newest first.
    const bundles: BundleFile[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage.from(BUCKET).list(FOLDER, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw new Error(`list failed: ${error.message}`);
      for (const f of data ?? []) {
        if (!f.name.endsWith('.zip')) continue;
        bundles.push({
          path: `${FOLDER}/${f.name}`,
          createdAt: f.created_at,
          size: Number(f.metadata?.size ?? 0),
        });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
    bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // 3. Safety: the live bundle must exist, otherwise something is off.
    if (!bundles.some(b => b.path === liveFile)) {
      throw new Error(`live bundle ${liveFile} not found in bucket, aborting`);
    }

    const keep = new Set([liveFile, ...bundles.slice(0, keepLatest).map(b => b.path)]);
    const toDelete = bundles.filter(b => !keep.has(b.path));
    const freedBytes = toDelete.reduce((sum, b) => sum + b.size, 0);

    // 4. Delete in chunks.
    let deleted = 0;
    if (!dryRun) {
      for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
        const chunk = toDelete.slice(i, i + DELETE_CHUNK).map(b => b.path);
        const { error } = await supabase.storage.from(BUCKET).remove(chunk);
        if (error) throw new Error(`remove failed after ${deleted} files: ${error.message}`);
        deleted += chunk.length;
      }
    }

    const result = {
      dryRun,
      liveBundle: manifest.bundleId,
      total: bundles.length,
      kept: [...keep],
      toDelete: toDelete.length,
      deleted,
      freedMB: Math.round(freedBytes / 1024 / 1024),
    };
    console.log('[ota-cleanup]', JSON.stringify({ ...result, kept: result.kept.length }));

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ota-cleanup] error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
