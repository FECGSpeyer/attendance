import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Task } from '../../utilities/interfaces';

const db = supabase as any;

@Injectable({
  providedIn: 'root'
})
export class TaskService {

  async getTasks(tenantId: number): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('tenant_id', tenantId)
      .order('due_date', { ascending: true, nullsFirst: false });

    return data ?? [];
  }

  async getTask(id: string): Promise<Task> {
    const { data } = await db
      .from('tasks')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('id', id)
      .single();

    return data;
  }

  async getTasksForProtocol(protocolId: string): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('protocol_id', protocolId)
      .order('created_at', { ascending: true });

    return data ?? [];
  }

  async getTasksForAgendaItem(agendaItemId: string): Promise<Task[]> {
    const { data } = await db
      .from('tasks')
      .select('*, responsible_person:player!responsible_person_id(id, firstName, lastName)')
      .eq('agenda_item_id', agendaItemId)
      .order('created_at', { ascending: true });

    return data ?? [];
  }

  async addTask(task: Omit<Task, 'id'>): Promise<Task> {
    const { data } = await db
      .from('tasks')
      .insert(task)
      .select()
      .single();

    return data;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { data } = await db
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    return data;
  }

  async deleteTask(id: string): Promise<void> {
    await db
      .from('tasks')
      .delete()
      .eq('id', id);
  }
}
