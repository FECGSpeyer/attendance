import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/send-push.ts'
import { logNotification } from '../_shared/log-notification.ts'

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  signins: boolean;
  signouts: boolean;
  enabled_tenants: number[] | null;
  push_enabled: boolean;
}

Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405
    });
  }
  try {
    const { attId, reason, type, notes, isParents } = await req.json();
    if (!attId || !type) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    console.log(`[quick-processor] start attId=${attId} type=${type} isParents=${!!isParents}`);
    const { data: attendanceData, error: attendanceError } = await supabase.from('person_attendances').select('*, attendance:attendance_id(date, type, typeInfo, tenant:tenantId(id, longName)), person:person_id(firstName, lastName)').eq('id', attId).single();
    if (attendanceError || !attendanceData) {
      console.error(`[quick-processor] attId=${attId} attendance lookup failed:`, attendanceError);
      return new Response(JSON.stringify({
        error: 'Attendance record not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const { data: tenantData, error: tenantError } = await supabase.from("tenantUsers").select("userId").or('role.eq.5,role.eq.1').eq('tenantId', attendanceData.attendance.tenant.id).range(0, 4999);
    if (tenantError || !tenantData) {
      console.error(`[quick-processor] attId=${attId} tenant=${attendanceData.attendance.tenant.id} tenantUsers lookup failed:`, tenantError);
      return new Response(JSON.stringify({
        error: 'Tenant users record not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    if (tenantData.length >= 4900) {
      console.warn(`[quick-processor] tenant=${attendanceData.attendance.tenant.id} tenantUsers=${tenantData.length} approaching the 5000-row range cap`);
    }
    const { data: notiData, error: notiError } = await supabase.from("notifications").select("*").or(`${tenantData.map((entry: any)=>`id.eq.${entry.userId}`).join(",")}`).range(0, 4999);
    if (notiError || !notiData) {
      console.error(`[quick-processor] attId=${attId} notifications lookup failed:`, notiError);
      return new Response(JSON.stringify({
        error: 'Notification config not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }

    const chatIds: { userId: string; chatId: string }[] = [];
    const pushUserIds: string[] = [];

    for (const noti of notiData as NotificationConfig[]) {
      if (!noti.enabled) continue;
      if (noti.enabled_tenants && !noti.enabled_tenants.includes(attendanceData.attendance.tenant.id)) continue;

      const isSigninType = type === "signin" || type === "lateSignin" || type === "neutralSignin" || type === "noteUpdate";
      const isSignoutType = type === "signout" || type === "lateSignout" || type === "noteUpdate";

      const shouldNotify = (noti.signins && isSigninType) || (noti.signouts && isSignoutType);
      if (!shouldNotify) continue;

      if (noti.telegram_chat_id) {
        chatIds.push({ userId: noti.id, chatId: noti.telegram_chat_id });
      }
      if (noti.push_enabled) {
        pushUserIds.push(noti.id);
      }
    }

    // Build message
    const name = attendanceData.person.firstName + " " + attendanceData.person.lastName;
    const date = `${attendanceData.attendance.date}`;
    const today = new Date(date);
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1;
    let dd = today.getDate();
    let DD = String(dd);
    let MM = String(mm);
    if (dd < 10) DD = '0' + dd;
    if (mm < 10) MM = '0' + mm;
    const getAttendanceText = (attendance: any)=>{
      return attendance.typeInfo ? " " + attendance.typeInfo : attendance.type === "vortrag" ? " (Vortrag)" : "";
    };
    const suffix = isParents ? "\n(von Elternteil abgemeldet)" : "";
    const formattedDate = DD + '.' + MM + '.' + yyyy + getAttendanceText(attendanceData.attendance);
    const attendanceLink = `\n\n[Anwesenheit öffnen](https://attendix.de/open-attendance?id=${attendanceData.attendance_id}&tenantId=${attendanceData.attendance.tenant.id})`;

    let messageText = `*${attendanceData.attendance.tenant.longName}*\n`;
    let pushBody = '';

    switch(type){
      case 'neutralSignin':
        messageText += `${name} hat sich für den ${formattedDate} angemeldet.${suffix}`;
        pushBody = `${name} hat sich für den ${formattedDate} angemeldet.${suffix}`;
        break;
      case 'signin':
        if (notes && notes.length) {
          messageText += `${name} hat sich für den ${formattedDate} angemeldet.\nNotiz: ${notes}${suffix}`;
          pushBody = `${name} hat sich für den ${formattedDate} angemeldet. Notiz: ${notes}${suffix}`;
        } else {
          messageText += `${name} hat sich für den ${formattedDate} angemeldet.${suffix}`;
          pushBody = `${name} hat sich für den ${formattedDate} angemeldet.${suffix}`;
        }
        break;
      case 'lateSignout':
        messageText += `${name} kommt am ${formattedDate} zu spät.\nGrund: ${reason}${suffix}`;
        pushBody = `${name} kommt am ${formattedDate} zu spät. Grund: ${reason}${suffix}`;
        break;
      case 'lateSignin':
        if (notes && notes.length) {
          messageText += `${name} kommt am ${formattedDate} doch pünktlich.\nNotiz: ${notes}${suffix}`;
          pushBody = `${name} kommt am ${formattedDate} doch pünktlich. Notiz: ${notes}${suffix}`;
        } else {
          messageText += `${name} kommt am ${formattedDate} doch pünktlich.${suffix}`;
          pushBody = `${name} kommt am ${formattedDate} doch pünktlich.${suffix}`;
        }
        break;
      case 'noteUpdate':
        messageText += `${name} hat die Notiz für den ${formattedDate} angepasst: ${reason}`;
        pushBody = `${name} hat die Notiz für den ${formattedDate} angepasst: ${reason}`;
        break;
      default:
        messageText += `${name} hat sich für den ${formattedDate} abgemeldet.\nGrund: ${reason}${suffix}`;
        pushBody = `${name} hat sich für den ${formattedDate} abgemeldet. Grund: ${reason}${suffix}`;
    }

    messageText += attendanceLink;

    // Send push notifications first (preferred channel)
    const pushTitle = attendanceData.attendance.tenant.longName;
    const pushSentUserIds = new Set<string>();
    for (const userId of pushUserIds) {
      const pushSent = await sendPushToUser(supabase, userId, {
        title: pushTitle,
        body: pushBody,
        data: { type: 'attendance', attendanceId: String(attendanceData.attendance_id), tenantId: String(attendanceData.attendance.tenant.id) },
      });
      if (pushSent > 0) {
        pushSentUserIds.add(userId);
        await logNotification(supabase, {
          userId,
          tenantId: attendanceData.attendance.tenant.id,
          type: 'attendance',
          title: pushTitle,
          body: pushBody,
          channels: ['push'],
          data: { type: 'attendance', attendanceId: String(attendanceData.attendance_id), tenantId: String(attendanceData.attendance.tenant.id) },
        });
      }
    }

    // Send Telegram messages only to users who did not receive push
    for (const { userId, chatId } of chatIds) {
      if (pushSentUserIds.has(userId)) continue;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: "markdown"
        })
      });
      await logNotification(supabase, {
        userId,
        tenantId: attendanceData.attendance.tenant.id,
        type: 'attendance',
        title: pushTitle,
        body: pushBody,
        channels: ['telegram'],
        data: { type: 'attendance', attendanceId: String(attendanceData.attendance_id), tenantId: String(attendanceData.attendance.tenant.id) },
      });
    }

    console.log(`[quick-processor] done attId=${attId} tenantUsers=${tenantData.length} notifications=${notiData.length}`);
    return new Response(JSON.stringify({
      message: 'Notifications sent successfully',
      attId: attId
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  } catch (error) {
    console.error('[quick-processor] fatal:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
});
