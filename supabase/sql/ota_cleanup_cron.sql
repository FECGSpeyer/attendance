-- Weekly cleanup of old OTA bundles in the `ota-bundles` bucket.
-- Calls the Edge Function `ota-cleanup`, which keeps the bundle from
-- manifest.json plus the newest 10 and deletes the rest (see its header).
--
-- Deleting goes through the Storage API in the Edge Function on purpose:
-- a plain DELETE on storage.objects would only drop the row and leave the
-- file on disk/S3. That also makes it work unchanged on self-hosted Supabase.
--
-- Same pattern as the other jobs (vault secrets project_url / anon_key).
-- Sundays 03:00 UTC, outside of rehearsal times.
select cron.schedule('ota-cleanup-job', '0 3 * * 0', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ota-cleanup',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{"dryRun": false}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Remove again:
-- select cron.unschedule('ota-cleanup-job');
