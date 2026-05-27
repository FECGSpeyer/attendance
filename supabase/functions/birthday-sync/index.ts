// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import dayjs from "https://deno.land/x/deno_dayjs@v0.5.0/mod.ts";
import { Telegraf } from 'npm:telegraf@4.16.3';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/send-push.ts';

console.info('server started');
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const getBirthdays = async ()=>{
  // Get current month and day for birthday filtering
  const currentMonth = dayjs().month() + 1; // dayjs months are 0-indexed, PostgreSQL months are 1-indexed
  const currentDay = dayjs().date();

  // Optimize: Filter birthdays in the database using PostgreSQL date functions
  // Only select fields we actually need
  const { data: birthdays, error: birthdaysError } = await supabase
    .from('player')
    .select('id, firstName, lastName, birthday, tenantId')
    .is("left", null)
    .is("correctBirthday", true)
    .filter('birthday', 'not.is', null);

  if (birthdaysError) {
    throw new Error("Failed to load players: " + JSON.stringify(birthdaysError));
  }

  if (!birthdays?.length) {
    console.log('No players with birthdays found');
    return;
  }

  // Filter birthdays in memory (PostgreSQL date extraction in filters is complex)
  const todaysBirthdays = birthdays.filter((p)=>{
    return dayjs(p.birthday).date() === currentDay && dayjs(p.birthday).month() === dayjs().month();
  });

  if (!todaysBirthdays?.length) {
    console.log('No birthdays today');
    return;
  }

  console.log(`Found ${todaysBirthdays.length} birthday(s) today`);

  const telegraf = new Telegraf(Deno.env.get("TELEGRAM_BOT_TOKEN"));

  // Get unique tenant IDs
  const tenantIds = [...new Set(todaysBirthdays.map(b => b.tenantId))];

  // Optimize: Fetch tenantUsers and notifications in a single batch for all tenants
  const { data: tenantUsers, error: tenantError } = await supabase
    .from("tenantUsers")
    .select("userId, tenantId, role")
    .in("tenantId", tenantIds)
    .neq("role", 3); // Exclude role 3

  if (tenantError) {
    throw new Error("No tenant data found: " + JSON.stringify(tenantError));
  }

  if (!tenantUsers?.length) {
    console.log('No tenant users found for these tenants');
    return;
  }

  // Get all unique user IDs from tenantUsers
  const userIds = [...new Set(tenantUsers.map(tu => tu.userId))];

  // Optimize: Fetch all notification configs in a single query
  const { data: allNotifications, error: notiError } = await supabase
    .from("notifications")
    .select("id, enabled, birthdays, telegram_chat_id, push_enabled, enabled_tenants")
    .eq("enabled", true)
    .eq("birthdays", true)
    .in("id", userIds);

  if (notiError) {
    throw new Error("Failed to load notification data: " + JSON.stringify(notiError));
  }

  if (!allNotifications?.length) {
    console.log('No users with birthday notifications enabled');
    return;
  }

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

    console.log(`Sending ${tenantBirthdays.length} birthday notification(s) to ${eligibleUsers.length} user(s) in tenant ${tenantId}`);

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
};
Deno.serve(async ()=>{
  try {
    await getBirthdays();
  } catch (error) {
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
