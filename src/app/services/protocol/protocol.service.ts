import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Protocol } from '../../utilities/interfaces';

const db = supabase as any;

@Injectable({
  providedIn: 'root'
})
export class ProtocolService {

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
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async upsertProtocol(protocol: Omit<Protocol, 'id'>): Promise<Protocol> {
    const { data } = await db
      .from('protocols')
      .upsert(
        { ...protocol, updated_at: new Date().toISOString() },
        { onConflict: 'attendance_id' }
      )
      .select()
      .single();

    return data;
  }

  async deleteProtocol(id: string): Promise<void> {
    await db
      .from('protocols')
      .delete()
      .eq('id', id);
  }
}
