// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Telegraf } from 'npm:telegraf@4.16.3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/send-push.ts';

console.info('server started');
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const getBirthdays = async ()=>{
  const startedAt = Date.now();
  // "Today" is always evaluated in Europe/Berlin so the cron's wall-clock
  // intent (08:00 Berlin) matches the date we compare against, regardless
  // of the runtime's tz (Edge Functions run in UTC).
  const berlinParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  const todayMonth = Number(berlinParts.month); // 1-12
  const todayDay = Number(berlinParts.day);

  console.log(`[birthday-sync] start month=${todayMonth} day=${todayDay} (Europe/Berlin) now=${new Date().toISOString()}`);

  // Filter month+day server-side via the select_todays_birthdays RPC so we
  // only pull today's matches instead of paging through every active player.
  // (The RPC's WHERE clause mirrors the previous JS filter; see
  // supabase/sql/add_select_todays_birthdays.sql.)
  const { data: todaysBirthdays, error: birthdaysError } = await supabase
    .rpc('select_todays_birthdays', { p_month: todayMonth, p_day: todayDay });

  if (birthdaysError) {
    throw new Error("Failed to load players: " + JSON.stringify(birthdaysError));
  }

  console.log(`[birthday-sync] found ${todaysBirthdays?.length ?? 0} birthday(s) today`);

  if (!todaysBirthdays?.length) {
    return;
  }

  const telegraf = new Telegraf(Deno.env.get("TELEGRAM_BOT_TOKEN"));

  // Get unique tenant IDs
  const tenantIds = [...new Set(todaysBirthdays.map(b => b.tenantId))];

  // Optimize: Fetch tenantUsers and notifications in a single batch for all tenants
  const { data: tenantUsers, error: tenantError } = await supabase
    .from("tenantUsers")
    .select("userId, tenantId, role")
    .in("tenantId", tenantIds)
    .neq("role", 3) // Exclude role 3
    .range(0, 4999); // guard against PostgREST's 1000-row default

  if (tenantError) {
    throw new Error("No tenant data found: " + JSON.stringify(tenantError));
  }

  if (!tenantUsers?.length) {
    console.log(`[birthday-sync] no tenant users found for tenants ${JSON.stringify(tenantIds)}`);
    return;
  }
  if (tenantUsers.length >= 4900) {
    console.warn(`[birthday-sync] tenantUsers=${tenantUsers.length} approaching the 5000-row range cap`);
  }

  // Get all unique user IDs from tenantUsers
  const userIds = [...new Set(tenantUsers.map(tu => tu.userId))];

  // Optimize: Fetch all notification configs in a single query
  const { data: allNotifications, error: notiError } = await supabase
    .from("notifications")
    .select("id, enabled, birthdays, telegram_chat_id, push_enabled, enabled_tenants")
    .eq("enabled", true)
    .eq("birthdays", true)
    .in("id", userIds)
    .range(0, 4999); // guard against PostgREST's 1000-row default

  if (notiError) {
    throw new Error("Failed to load notification data: " + JSON.stringify(notiError));
  }

  if (!allNotifications?.length) {
    console.log('[birthday-sync] no users with birthday notifications enabled');
    return;
  }
  if (allNotifications.length >= 4900) {
    console.warn(`[birthday-sync] notifications=${allNotifications.length} approaching the 5000-row range cap`);
  }
  console.log(`[birthday-sync] tenants=${tenantIds.length} eligibleNotifConfigs=${allNotifications.length}`);

  const getBirthdayString = (bs)=>{
    let bString = "";
    bs.map((p, index)=>{
      if (bs.length === index + 1) {
        bString += `${p.firstName} ${p.lastName} Geburtstag.`;
      } else {
        bString += `${p.firstName} ${p.lastName} und `;
      }
    });
    return bString;
  };

  // Process notifications per tenant (to avoid duplicates)
  const processedTenants = new Set();

  for (const tenantId of tenantIds) {
    if (processedTenants.has(tenantId)) {
      continue;
    }
    processedTenants.add(tenantId);

    // Get birthdays for this tenant
    const tenantBirthdays = todaysBirthdays.filter(b => b.tenantId === tenantId);

    // Build message
    const message = tenantBirthdays.length === 1
      ? `Heute hat ${tenantBirthdays[0].firstName} ${tenantBirthdays[0].lastName} Geburtstag.`
      : `Heute haben ${getBirthdayString(tenantBirthdays)}`;

    // Get users for this tenant
    const tenantUserIds = tenantUsers
      .filter(tu => tu.tenantId === tenantId)
      .map(tu => tu.userId);

    // Get eligible notification configs for this tenant
    // For birthday notifications, if enabled_tenants is empty/null, send to all tenants
    // If enabled_tenants has values, only send if this tenant is included
    const eligibleUsers = allNotifications.filter(nd => {
      // Must have at least one notification channel
      if (!nd.telegram_chat_id && !nd.push_enabled) return false;

      // Must be a user in this tenant
      if (!tenantUserIds.includes(nd.id)) return false;

      // If enabled_tenants is null or empty, send for all tenants
      if (!nd.enabled_tenants || nd.enabled_tenants.length === 0) return true;

      // Otherwise, check if this tenant is in the enabled list
      return nd.enabled_tenants.includes(tenantId);
    });

    console.log(`[birthday-sync] tenant=${tenantId} sending ${tenantBirthdays.length} birthday notification(s) to ${eligibleUsers.length} user(s)`);

    // Send notifications to all eligible users
    for (const user of eligibleUsers){
      let pushSentSuccessfully = false;

      // Try push notification first (preferred channel)
      if (user.push_enabled) {
        console.log(`[SENDING] PUSH to user ${user.id}: "${message}"`);
        try {
          const pushSent = await sendPushToUser(supabase, user.id, {
            title: '🎉 Geburtstag',
            body: message,
            data: {
              type: 'birthday',
              tenantId: String(tenantId),
            },
          });
          if (pushSent > 0) {
            pushSentSuccessfully = true;
            console.log(`✓ Push birthday notification sent to ${user.id}`);
          } else {
            console.log(`✗ Push failed for ${user.id} (no devices)`);
          }
        } catch (e) {
          console.error(`✗ Error sending push notification to ${user.id}:`, e);
        }
      }

      // Fallback to Telegram if push was not sent successfully
      if (user.telegram_chat_id && !pushSentSuccessfully) {
        console.log(`[SENDING] TELEGRAM to ${user.telegram_chat_id}: "${message}"`);
        try {
          await telegraf.telegram.sendMessage(user.telegram_chat_id, message);
          console.log(`✓ Telegram birthday notification sent to ${user.telegram_chat_id}`);
        } catch (e) {
          console.error(`✗ Error sending Telegram message to ${user.telegram_chat_id}:`, e);
        }
      }
    }
  }

  console.log(`[birthday-sync] done tenants=${tenantIds.length} elapsedMs=${Date.now() - startedAt}`);
};
Deno.serve(async ()=>{
  try {
    await getBirthdays();
  } catch (error) {
    console.error('[birthday-sync] fatal:', error);
    return new Response(JSON.stringify({
      error: error?.message ?? "Failed to send notifications!"
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
  return new Response(JSON.stringify({
    message: 'Birthday notifications sent successfully'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
    }
  });
});
