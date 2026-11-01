import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import {
  AttendanceResponse,
  AutoMessagePreviewTermin,
  AutoMessageRule,
  AutoMessageRun,
  Message,
  MessageRecipient,
} from '../../utilities/interfaces';
import { translate } from '@jsverse/transloco';
import { currentIntlLocale, currentLanguage } from '../../i18n/languages';

/** Placeholders offered in the rule editor (same names in every language). */
export const AUTO_MESSAGE_PLACEHOLDERS = ['vorname', 'name', 'termin', 'datum', 'uhrzeit', 'instanz', 'anzahl'];
/**
 * A template text with its placeholders kept as {name} (ICU would otherwise
 * replace them, since they look like arguments).
 */
export function templateText(key: string): string {
  return translate(key, Object.fromEntries(AUTO_MESSAGE_PLACEHOLDERS.map(p => [p, `{${p}}`])));
}

export const AUTO_MESSAGE_TEMPLATES = ['absent', 'late', 'noAnswer', 'streak'];
export const RESPONSE_REASONS = ['sick', 'work', 'family', 'forgot', 'other'];
/** Members can answer this many days after the Termin (same in attendance-response). */
export const RESPONSE_DAYS = 7;

export function defaultAutoMessageRule(tenantId: number): AutoMessageRule {
  return {
    tenantId,
    name: '',
    enabled: false,
    statuses: [4],
    type_ids: null,
    group_ids: null,
    delay_minutes: 120,
    frequency: 'each',
    frequency_count: 2,
    frequency_days: 30,
    channels: ['push'],
    use_template: true,
    template_key: 'absent',
    title: null,
    body_json: null,
    allow_responses: true,
    instant_excuse: false,
    copy_responsibles: false,
    copy_voice_leaders: false,
  };
}

/**
 * Automatische Nachrichten: rules, their history (runs), the preview and the
 * answers of members (attendance_responses). Sending happens in the
 * send-auto-messages Edge Function; answers go through attendance-response.
 *
 * NOTE: the tables are cast to any until `npm run genTypes` includes them.
 */
@Injectable({
  providedIn: 'root'
})
export class AutoMessageService {

  async getRules(tenantId: number): Promise<AutoMessageRule[]> {
    const { data, error } = await supabase
      .from('auto_message_rules' as any)
      .select('*')
      .eq('tenantId', tenantId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AutoMessageRule[];
  }

  async getRule(id: string): Promise<AutoMessageRule | null> {
    const { data, error } = await supabase
      .from('auto_message_rules' as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as AutoMessageRule | null;
  }

  /** Inserts or updates a rule. Switching it on stamps enabled_at, so older Termine are never sent. */
  async saveRule(rule: AutoMessageRule, previous: AutoMessageRule | null, userId: string): Promise<AutoMessageRule> {
    const row: Record<string, unknown> = { ...rule, updated_at: new Date().toISOString() };
    delete row['created_at'];
    if (rule.enabled && (!previous?.enabled || !previous.enabled_at)) {
      row['enabled_at'] = new Date().toISOString();
    }
    if (!rule.id) {
      delete row['id'];
      row['created_by'] = userId;
    }
    const query = rule.id
      ? supabase.from('auto_message_rules' as any).update(row as any).eq('id', rule.id)
      : supabase.from('auto_message_rules' as any).insert(row as any);
    const { data, error } = await query.select('*').single();
    if (error) throw new Error(error.message);
    return data as unknown as AutoMessageRule;
  }

  async setEnabled(rule: AutoMessageRule, enabled: boolean): Promise<AutoMessageRule> {
    const row: Record<string, unknown> = { enabled, updated_at: new Date().toISOString() };
    if (enabled) row['enabled_at'] = new Date().toISOString();
    const { data, error } = await supabase
      .from('auto_message_rules' as any)
      .update(row as any)
      .eq('id', rule.id!)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as AutoMessageRule;
  }

  async deleteRule(id: string): Promise<void> {
    const { error } = await supabase.from('auto_message_rules' as any).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async preview(tenantId: number, rule: AutoMessageRule): Promise<AutoMessagePreviewTermin[]> {
    const { data, error } = await supabase.functions.invoke('send-auto-messages', {
      body: { dryRun: true, tenantId, rule },
    });
    if (error) throw new Error(error.message);
    return (data?.termine ?? []) as AutoMessagePreviewTermin[];
  }

  async getRuns(ruleId: string, limit = 30): Promise<AutoMessageRun[]> {
    const { data, error } = await supabase
      .from('auto_message_runs' as any)
      .select('*')
      .eq('rule_id', ruleId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AutoMessageRun[];
  }

  async getRunsForAttendance(attendanceId: number): Promise<AutoMessageRun[]> {
    const { data, error } = await supabase
      .from('auto_message_runs' as any)
      .select('*')
      .eq('attendance_id', attendanceId);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AutoMessageRun[];
  }

  /** Recent runs of all rules of a tenant (for the "last week" line). */
  async getRecentRuns(tenantId: number, since: string): Promise<AutoMessageRun[]> {
    const { data, error } = await supabase
      .from('auto_message_runs' as any)
      .select('*')
      .eq('tenantId', tenantId)
      .gte('created_at', since)
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AutoMessageRun[];
  }

  /** "Diesmal aussetzen": no automatic message of this rule for this Termin. */
  async suspend(rule: AutoMessageRule, attendanceId: number, userId: string, userName: string): Promise<void> {
    const { error } = await supabase.from('auto_message_runs' as any).insert({
      rule_id: rule.id,
      tenantId: rule.tenantId,
      attendance_id: attendanceId,
      status: 'suspended',
      created_by: userId,
      created_by_name: userName,
    } as any);
    if (error) throw new Error(error.message);
  }

  async unsuspend(runId: string): Promise<void> {
    const { error } = await supabase.from('auto_message_runs' as any).delete().eq('id', runId).eq('status', 'suspended');
    if (error) throw new Error(error.message);
  }

  /** Date and name of Termine (for the history of a rule). */
  async getAttendanceInfo(ids: number[]): Promise<{ id: number; date: string; typeInfo: string | null; type_id: string | null }[]> {
    if (!ids.length) return [];
    const { data, error } = await supabase
      .from('attendance')
      .select('id, date, typeInfo, type_id')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as any;
  }

  /** Recipient rows of several messages (read state per person for the history). */
  async getRecipientsOf(messageIds: string[]): Promise<MessageRecipient[]> {
    if (!messageIds.length) return [];
    const { data, error } = await supabase
      .from('message_recipients' as any)
      .select('id, message_id, player_id, user_id, name, email, push_sent_at, telegram_sent_at, push_enabled, email_sent_at, email_opened_at, read_at, person_attendance_id')
      .in('message_id', messageIds)
      .range(0, 4999);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MessageRecipient[];
  }

  async getResponsesForAttendance(attendanceId: number): Promise<AttendanceResponse[]> {
    const { data, error } = await supabase
      .from('attendance_responses' as any)
      .select('*')
      .eq('attendance_id', attendanceId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AttendanceResponse[];
  }

  async getResponsesForMessages(messageIds: string[]): Promise<AttendanceResponse[]> {
    if (!messageIds.length) return [];
    const { data, error } = await supabase
      .from('attendance_responses' as any)
      .select('*')
      .in('message_id', messageIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AttendanceResponse[];
  }

  /** The current member's own answer to a Termin message, if any. */
  async getOwnResponse(personAttendanceId: string): Promise<AttendanceResponse | null> {
    const { data, error } = await supabase
      .from('attendance_responses' as any)
      .select('*')
      .eq('person_attendance_id', personAttendanceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as AttendanceResponse | null;
  }

  async submitResponse(messageId: string, kind: 'reason' | 'was_present', reasonCode: string | null, text: string): Promise<{ state: string }> {
    const { data, error } = await supabase.functions.invoke('attendance-response', {
      body: { action: 'submit', messageId, kind, reasonCode, text },
    });
    if (error) throw new Error(await functionError(error));
    return data as { state: string };
  }

  async decideResponse(responseId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.functions.invoke('attendance-response', {
      body: { action: 'decide', responseId, accept },
    });
    if (error) throw new Error(await functionError(error));
  }

  /** Status of the current member for the Termin of a message. */
  async getPersonAttendanceStatus(personAttendanceId: string): Promise<number | null> {
    const { data } = await supabase
      .from('person_attendances')
      .select('status')
      .eq('id', personAttendanceId)
      .maybeSingle();
    return (data?.status ?? null) as number | null;
  }
}

async function functionError(error: any): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch {
    // ignore
  }
  return error?.message ?? 'error';
}

/** Date of a Termin (YYYY-MM-DD) in the app's locale, e.g. "Di., 28.10.2026". */
export function formatTerminDate(date: string | null | undefined): string {
  if (!date) return '';
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString(currentIntlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Replaces {name} placeholders; unknown ones stay as they are. */
export function fillPlaceholders(text: string, vars: Record<string, unknown>, html = false): string {
  return (text ?? '').replace(/\{(\w+)\}/g, (m, name: string) => {
    const value = vars[name];
    if (value === undefined || value === null) return m;
    return html ? escapeHtml(String(value)) : String(value);
  });
}

/**
 * Title and HTML of a message as one recipient sees it: the template in the
 * recipient's language (automatic messages) with all placeholders filled.
 */
export function personalizeMessage(message: Message, recipient: MessageRecipient | null): { title: string; html: string } {
  const lang = recipient?.lang || currentLanguage();
  const version = message.i18n?.[lang] ?? null;
  const vars: Record<string, unknown> = {
    ...(message.vars ?? {}),
    datum: formatTerminDate(message.vars?.['date']),
    ...(recipient?.vars ?? {}),
  };
  return {
    title: fillPlaceholders(version?.title ?? message.title, vars),
    html: fillPlaceholders(version?.html ?? message.body_html, vars, true),
  };
}

/** Plain template text (paragraphs separated by blank lines) as a Tiptap document. */
export function textToDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: text.split(/\n\n+/).map(para => ({
      type: 'paragraph',
      content: para.split('\n').flatMap((line, i) => [
        ...(i > 0 ? [{ type: 'hardBreak' }] : []),
        ...(line ? [{ type: 'text', text: line }] : []),
      ]),
    })),
  };
}
