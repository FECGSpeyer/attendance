import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Task } from '../../utilities/interfaces';

const db = supabase as any;

const TASK_SELECT = '*, responsible_person:player!responsible_person_id(id, firstName, lastName), agenda_item:agenda_items!agenda_item_id(id, title), attendance:attendance!attendance_id(id, date, typeInfo)';

type TaskWrite = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'responsible_person' | 'agenda_item' | 'attendance' | 'completed_at'>;

function toTaskWrite(task: Partial<Task>): Partial<TaskWrite> {
  const { id, created_at, updated_at, responsible_person, agenda_item, attendance, completed_at, ...write } = task;
  return write;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {

  async getTasks(tenantId: number): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('tenant_id', tenantId)
      .order('due_date', { ascending: true, nullsFirst: false });

    return data ?? [];
  }

  /** Tasks assigned to one person (members only get these via RLS anyway). */
  async getTasksForPerson(tenantId: number, personIds: number[]): Promise<Task[]> {
    if (!personIds.length) return [];
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('tenant_id', tenantId)
      .in('responsible_person_id', personIds)
      .order('due_date', { ascending: true, nullsFirst: false });

    return data ?? [];
  }

  async getTasksForAttendance(attendanceId: number): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('attendance_id', attendanceId)
      .order('created_at', { ascending: true });

    return data ?? [];
  }

  async getTask(id: string): Promise<Task> {
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('id', id)
      .single();

    return data;
  }

  async getTasksForProtocol(protocolId: string): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('protocol_id', protocolId)
      .order('created_at', { ascending: true });

    return data ?? [];
  }

  async getTasksForAgendaItem(agendaItemId: string): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select(TASK_SELECT)
      .eq('agenda_item_id', agendaItemId)
      .order('created_at', { ascending: true });

    return data ?? [];
  }

  async addTask(task: Omit<Task, 'id'>): Promise<Task> {
    const { data, error } = await db
      .from('tasks')
      .insert(toTaskWrite(task))
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    return data;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { data, error } = await db
      .from('tasks')
      .update({ ...toTaskWrite(updates), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    return data;
  }

  async deleteTask(id: string): Promise<void> {
    const { data, error } = await db
      .from('tasks')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('Keine Berechtigung zum Löschen');
  }
}
