// supabase/functions/live-activity-token/index.ts
// Deploy: supabase functions deploy live-activity-token (called with the anon key)
//
// Registers the update token of a Live Activity that iOS started by
// push-to-start while the app was closed. The app is only woken in the
// background then (no WebView, no login session), so the native code sends
// the device's push-to-start token along and the user is found by it.
// Without this the activity stays on "Beginnt in 0:00" until the app is opened.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HEX = /^[0-9a-f]{32,512}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.json().catch(() => null);
  const startToken = String(body?.startToken ?? '');
  const token = String(body?.token ?? '');
  const attendanceId = Number(body?.attendanceId);
  const planKey = String(body?.planKey ?? '');
  if (!HEX.test(startToken) || !HEX.test(token) || !Number.isInteger(attendanceId) || attendanceId <= 0 || !planKey || planKey.length > 100) {
    return new Response('Bad request', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: owner } = await supabase.from('live_activity_tokens').select('user_id')
    .eq('kind', 'start').eq('platform', 'ios').eq('token', startToken).limit(1).maybeSingle();
  if (!owner) return new Response('Unknown device', { status: 404 });

  const { error } = await supabase.from('live_activity_tokens').upsert({
    user_id: owner.user_id,
    kind: 'update',
    attendance_id: attendanceId,
    plan_key: planKey,
    token,
    platform: 'ios',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,kind,attendance_id,plan_key' });
  if (error) {
    console.error('live-activity-token upsert failed', error);
    return new Response('Error', { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
