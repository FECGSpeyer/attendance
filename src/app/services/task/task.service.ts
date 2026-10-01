import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Task } from '../../utilities/interfaces';

const db = supabase as any;

type TaskWrite = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'responsible_person'>;

function toTaskWrite(task: Partial<Task>): Partial<TaskWrite> {
  const { id, created_at, updated_at, responsible_person, ...write } = task;
  return write;
}

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
    const { data, error } = await db
      .from('tasks')
      .insert(toTaskWrite(task))
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { data, error } = await db
      .from('tasks')
      .update({ ...toTaskWrite(updates), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteTask(id: string): Promise<void> {
    await db
      .from('tasks')
      .delete()
      .eq('id', id);
  }
}
