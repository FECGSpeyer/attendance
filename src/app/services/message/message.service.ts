import { Injectable } from '@angular/core';
import { JSONContent } from '@tiptap/core';
import { supabase } from '../base/supabase';
import { Message, MessageRecipient, MessageRecipientCounts } from '../../utilities/interfaces';

export interface SendMessageParams {
  tenantId: number;
  title: string;
  content: JSONContent;
  groupIds: number[] | null;
  channels: { push: boolean; email: boolean };
}

/**
 * Mitteilungen: general messages from admins/responsibles to all members.
 * Sending and all delivery tracking happen in the send-message / resend-webhook
 * Edge Functions; the client reads messages and recipient rows (RLS limits
 * members to their own copy) and marks its own copy read.
 *
 * NOTE: the tables are cast to any until `npm run genTypes` includes them.
 */
@Injectable({
  providedIn: 'root'
})
export class MessageService {

  async getMessages(tenantId: number): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages' as any)
      .select('id, tenantId, sender_id, sender_name, title, body_text, channels, group_ids, recipient_count, status, created_at, sent_at')
      .eq('tenantId', tenantId)
      .order('created_at', { ascending: false })
      .limit(100); // keeps the in.(...) filter of getStats() short

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as unknown as Message[];
  }

  async getMessage(id: string): Promise<Message | null> {
    const { data, error } = await supabase
      .from('messages' as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? null) as unknown as Message | null;
  }

  /** Recipient rows of one message. Admins get all rows, members only their own. */
  async getRecipients(messageId: string): Promise<MessageRecipient[]> {
    const { data, error } = await supabase
      .from('message_recipients' as any)
      .select('*')
      .eq('message_id', messageId)
      .order('name', { ascending: true })
      .range(0, 4999);

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as unknown as MessageRecipient[];
  }

  /**
   * Read/problem counts per message for the list page. Only fetches the few
   * columns needed and aggregates client-side.
   */
  async getStats(messageIds: string[]): Promise<Map<string, { read: number; problems: number }>> {
    const stats = new Map<string, { read: number; problems: number }>();
    if (messageIds.length === 0) {
      return stats;
    }

    const { data, error } = await supabase
      .from('message_recipients' as any)
      .select('message_id, read_at, email_opened_at, push_failed, email_failed')
      .in('message_id', messageIds)
      .range(0, 49999);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as unknown as Pick<MessageRecipient, 'message_id' | 'read_at' | 'email_opened_at' | 'push_failed' | 'email_failed'>[]) {
      const s = stats.get(row.message_id) ?? { read: 0, problems: 0 };
      if (row.read_at || row.email_opened_at) s.read++;
      if (row.push_failed || row.email_failed) s.problems++;
      stats.set(row.message_id, s);
    }
    return stats;
  }

  /** Messages the current user received in a tenant (newest first). */
  async getReceivedMessages(userId: string, tenantId: number, limit = 20): Promise<Message[]> {
    const { data: rows, error } = await supabase
      .from('message_recipients' as any)
      .select('message_id')
      .eq('user_id', userId)
      .eq('tenantId', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }
    const ids = ((rows ?? []) as unknown as { message_id: string }[]).map(r => r.message_id);
    if (ids.length === 0) {
      return [];
    }

    const { data, error: msgError } = await supabase
      .from('messages' as any)
      .select('id, tenantId, title, sender_name, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (msgError) {
      throw new Error(msgError.message);
    }
    return (data ?? []) as unknown as Message[];
  }

  async getRecipientCounts(tenantId: number, groupIds: number[] | null, channels: { push: boolean; email: boolean }): Promise<MessageRecipientCounts> {
    const { data, error } = await supabase.functions.invoke('send-message', {
      body: { tenantId, groupIds, channels, dryRun: true },
    });

    if (error) {
      throw new Error(error.message);
    }
    return data as MessageRecipientCounts;
  }

  async send(params: SendMessageParams): Promise<string> {
    const { data, error } = await supabase.functions.invoke('send-message', {
      body: params,
    });

    if (error || !data?.messageId) {
      throw new Error(error?.message ?? 'send-message failed');
    }
    return data.messageId as string;
  }

  async markRead(messageId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_message_read' as any, { p_message_id: messageId } as any);
    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase
      .from('messages' as any)
      .delete()
      .eq('id', messageId);

    if (error) {
      throw new Error(error.message);
    }
  }
}
