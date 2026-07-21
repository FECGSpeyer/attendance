// supabase/functions/_shared/log-notification.ts
// Shared helper for recording a notification into the user_notifications feed
// (the "notification center"). Called from each function's per-recipient send
// loop right after a confirmed-successful push/telegram/email send.
//
// One logical notification = one feed row. When the same notification goes out
// on more than one channel (e.g. push + email for one reminder), the extra
// channels are merged into the existing row's channels[] array instead of
// creating a duplicate entry, so the user never sees the same notification
// twice. Dedupe key: (user_id, tenantId, type, data->>attendanceId). Rows
// without an attendanceId (birthday/criticals) are never merged — they may
// legitimately recur — and are always inserted.
//
// Best-effort: this must never throw into the send flow. A failed log is logged
// to the console and swallowed so it can't break notification delivery.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface LogNotificationParams {
  userId: string | null;
  tenantId: number;
  type: string;                 // reminder|checklist|criticals|birthday|attendance
  title: string;
  body: string;
  channels: string[];           // ['push'] | ['telegram'] | ['email']
  data?: Record<string, string>;
  email?: string | null;
  read?: boolean;               // pre-mark as read (e.g. birthdays — informational only)
}

export async function logNotification(
  supabase: SupabaseClient,
  p: LogNotificationParams,
): Promise<void> {
  try {
    const attendanceId = p.data?.attendanceId ?? null;

    // Rows tied to an attendance are deduped: if one already exists for this
    // (user, tenant, type, attendance), merge the channel into it.
    if (p.userId && attendanceId) {
      const { data: existing, error: selErr } = await supabase
        .from('user_notifications')
        .select('id, channels')
        .eq('user_id', p.userId)
        .eq('tenantId', p.tenantId)
        .eq('type', p.type)
        .eq('data->>attendanceId', String(attendanceId))
        .limit(1)
        .maybeSingle();

      if (selErr) {
        console.error('[log-notification] select error:', selErr);
      } else if (existing) {
        const merged = Array.from(new Set([...(existing.channels ?? []), ...p.channels]));
        const { error: updErr } = await supabase
          .from('user_notifications')
          .update({ channels: merged })
          .eq('id', existing.id);
        if (updErr) {
          console.error('[log-notification] channel-merge update error:', updErr);
        }
        return;
      }
    }

    const { error } = await supabase.from('user_notifications').insert({
      user_id: p.userId,
      tenantId: p.tenantId,
      type: p.type,
      title: p.title,
      body: p.body,
      channels: p.channels,
      email: p.email ?? null,
      data: p.data ?? {},
      read: p.read ?? false,
    });
    if (error) {
      console.error('[log-notification] insert error:', error);
    }
  } catch (e) {
    console.error('[log-notification] failed:', e);
  }
}
