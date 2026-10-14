import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Protocol, ProtocolOutcome } from '../../utilities/interfaces';

const db = supabase as any;

const PROTOCOL_LIST_SELECT = 'id, attendance_id, tenant_id, status, published_at, updated_at, created_at, outcomes, attendance:attendance!attendance_id(id, date, typeInfo, type_id)';

@Injectable({
  providedIn: 'root'
})
export class ProtocolService {

  /** Leadership: draft or published. Members: only published protocols of their circle (RLS). */
  async getProtocolForAttendance(attendanceId: number): Promise<Protocol | null> {
    const { data } = await db
      .from('protocols')
      .select('*')
      .eq('attendance_id', attendanceId)
      .maybeSingle();

    return data;
  }

  async getProtocols(tenantId: number): Promise<Protocol[]> {
    const { data } = await db
      .from('protocols')
      .select(PROTOCOL_LIST_SELECT)
      .eq('tenant_id', tenantId);

    return ((data ?? []) as Protocol[]).sort((a, b) =>
      new Date(b.attendance?.date ?? b.created_at).getTime() - new Date(a.attendance?.date ?? a.created_at).getTime());
  }

  /**
   * Saves one section (note and/or outcome) atomically on the server, so
   * several people writing in different sections never overwrite each other.
   */
  async saveSection(attendanceId: number, fieldId: string, changes: {
    doc?: Record<string, unknown>;
    outcome?: ProtocolOutcome | null;
  }): Promise<Protocol> {
    const { data, error } = await db.rpc('save_protocol_section', {
      p_attendance_id: attendanceId,
      p_field_id: fieldId,
      p_doc: changes.doc ?? null,
      p_outcome: changes.outcome ?? null,
      p_clear_outcome: changes.outcome === null,
    });

    if (error) throw error;
    return data;
  }

  async publish(attendanceId: number): Promise<Protocol> {
    const { data, error } = await db.rpc('publish_protocol', { p_attendance_id: attendanceId });
    if (error) throw error;
    return data;
  }

  async deleteProtocol(id: string): Promise<void> {
    const { error } = await db
      .from('protocols')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Uploads a protocol PDF to the public `attendances` bucket (same place the
   * Telegram plan export uses), so the notification can attach it. Returns the
   * public URL and the storage path for removing it afterwards.
   */
  async uploadPdf(attendanceId: number, blob: Blob): Promise<{ url: string; path: string }> {
    const path = `protocols/${attendanceId}_${Date.now()}.pdf`;
    const { error } = await db.storage
      .from('attendances')
      .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (error) throw error;
    const { data } = db.storage.from('attendances').getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  async removePdf(path: string): Promise<void> {
    await db.storage.from('attendances').remove([path]);
  }
}
