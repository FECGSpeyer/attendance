import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { AgendaItem, AgendaItemAttendance } from '../../utilities/interfaces';

const db = supabase as any;

@Injectable({
  providedIn: 'root'
})
export class AgendaItemService {

  async getAgendaItems(tenantId: number): Promise<AgendaItem[]> {
    const { data } = await db
      .from('agenda_items')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async getAgendaItem(id: string): Promise<AgendaItem> {
    const { data } = await db
      .from('agenda_items')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('id', id)
      .single();

    return data;
  }

  async getAgendaItemsForAttendance(attendanceId: number): Promise<AgendaItem[]> {
    const { data } = await db
      .from('agenda_item_attendances')
      .select('agenda_item:agenda_items(*, responsible_person:player!responsible_person_id(id, firstName, lastName))')
      .eq('attendance_id', attendanceId);

    return (data ?? []).map((row: any) => row.agenda_item).filter(Boolean);
  }

  async addAgendaItem(item: Omit<AgendaItem, 'id'>): Promise<AgendaItem> {
    const { data } = await db
      .from('agenda_items')
      .insert(item)
      .select()
      .single();

    return data;
  }

  async updateAgendaItem(id: string, updates: Partial<AgendaItem>): Promise<AgendaItem> {
    const { data } = await db
      .from('agenda_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return data;
  }

  async deleteAgendaItem(id: string): Promise<void> {
    await db
      .from('agenda_items')
      .delete()
      .eq('id', id);
  }

  async linkToAttendance(agendaItemId: string, attendanceId: number): Promise<void> {
    await db
      .from('agenda_item_attendances')
      .insert({ agenda_item_id: agendaItemId, attendance_id: attendanceId });
  }

  async unlinkFromAttendance(agendaItemId: string, attendanceId: number): Promise<void> {
    await db
      .from('agenda_item_attendances')
      .delete()
      .match({ agenda_item_id: agendaItemId, attendance_id: attendanceId });
  }

  async getLinkedAttendances(agendaItemId: string): Promise<AgendaItemAttendance[]> {
    const { data } = await db
      .from('agenda_item_attendances')
      .select('*, attendance:attendance!attendance_id(id, date, typeInfo, type_id)')
      .eq('agenda_item_id', agendaItemId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }
}
