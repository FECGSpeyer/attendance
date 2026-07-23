import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { UserNotification } from '../../utilities/interfaces';

/**
 * Reads/updates the user_notifications feed (the "notification center").
 * Rows are written server-side by Edge Functions; the client only reads them
 * and marks them read. All access is scoped to a (userId, tenantId) pair and
 * enforced again by RLS.
 *
 * NOTE: 'user_notifications' is cast to any on the query builder until
 * `npm run genTypes` regenerates the Database types to include the table.
 */
@Injectable({
  providedIn: 'root'
})
export class UserNotificationService {

  async getNotifications(userId: string, tenantId: number, limit = 50): Promise<UserNotification[]> {
    const { data, error } = await supabase
      .from('user_notifications' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as UserNotification[];
  }

  async getUnreadCount(userId: string, tenantId: number): Promise<number> {
    const { count, error } = await supabase
      .from('user_notifications' as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .eq('read', false);

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .update({ read: true })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Marks all unread feed rows that match a notification the user just opened
   * (via push tap or Telegram deep-link) as read. Matches on tenant + type, and
   * — when the notification relates to an attendance — on data->>attendanceId,
   * so every channel row (push/telegram/email) for the same event is cleared.
   */
  async markMatchingRead(userId: string, tenantId: number, type: string, attendanceId?: string | number | null): Promise<void> {
    let query = supabase
      .from('user_notifications' as any)
      .update({ read: true })
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .eq('type', type)
      .eq('read', false);

    if (attendanceId !== undefined && attendanceId !== null && attendanceId !== '') {
      query = query.eq('data->>attendanceId', String(attendanceId));
    }

    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Marks every unread feed row for a given attendance read, regardless of type
   * or channel. Used by the /open-attendance deep-link resolver (email/Telegram
   * links), which knows the attendance id but not the notification type.
   */
  async markReadByAttendance(userId: string, tenantId: number, attendanceId: string | number): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .update({ read: true })
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .eq('read', false)
      .eq('data->>attendanceId', String(attendanceId));

    if (error) {
      throw new Error(error.message);
    }
  }

  async markUnread(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .update({ read: false })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteOne(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async markAllRead(userId: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .update({ read: true })
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .eq('read', false);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteAll(userId: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('user_notifications' as any)
      .delete()
      .eq('user_id', userId)
      .eq('tenantId', tenantId);

    if (error) {
      throw new Error(error.message);
    }
  }
}
