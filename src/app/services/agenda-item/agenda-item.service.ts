import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { AgendaItem, AgendaItemHistoryEntry } from '../../utilities/interfaces';
import { translate } from '@jsverse/transloco';

const db = supabase as any;

const AGENDA_ITEM_SELECT = '*, responsible_person:player!responsible_person_id(id, firstName, lastName), proposer:player!proposed_by(id, firstName, lastName)';

type AgendaItemWrite = Omit<AgendaItem, 'id' | 'created_at' | 'responsible_person' | 'proposer'>;

function toAgendaItemWrite(item: Partial<AgendaItem>): Partial<AgendaItemWrite> {
  const { id, created_at, responsible_person, proposer, ...write } = item;
  return write;
}

@Injectable({
  providedIn: 'root'
})
export class AgendaItemService {

  /** Leadership: all topics. Members: only their own suggestions (RLS). */
  async getAgendaItems(tenantId: number): Promise<AgendaItem[]> {
    const { data } = await db
      .from('agenda_items')
      .select(AGENDA_ITEM_SELECT)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async getAgendaItem(id: string): Promise<AgendaItem> {
    const { data } = await db
      .from('agenda_items')
      .select(AGENDA_ITEM_SELECT)
      .eq('id', id)
      .single();

    return data;
  }

  async getAgendaItemsByIds(ids: string[]): Promise<AgendaItem[]> {
    if (!ids.length) return [];
    const { data } = await db
      .from('agenda_items')
      .select(AGENDA_ITEM_SELECT)
      .in('id', ids);

    return data ?? [];
  }

  async addAgendaItem(item: Omit<AgendaItem, 'id'>): Promise<AgendaItem> {
    const { data, error } = await db
      .from('agenda_items')
      .insert(toAgendaItemWrite(item))
      .select(AGENDA_ITEM_SELECT)
      .single();

    if (error) throw error;
    return data;
  }

  /** A member suggests a topic; it waits for the leadership's decision. */
  async proposeAgendaItem(item: Pick<AgendaItem, 'tenant_id' | 'title' | 'description' | 'proposed_by'>): Promise<void> {
    // Members can't read the row back before it is theirs via RLS, so no select here.
    const { error } = await db
      .from('agenda_items')
      .insert({
        ...item,
        status: 'open',
        priority: 'medium',
        proposal_status: 'pending',
      });

    if (error) throw error;
  }

  async updateAgendaItem(id: string, updates: Partial<AgendaItem>): Promise<AgendaItem> {
    const { data, error } = await db
      .from('agenda_items')
      .update(toAgendaItemWrite(updates))
      .eq('id', id)
      .select(AGENDA_ITEM_SELECT)
      .single();

    if (error) throw error;
    return data;
  }

  async deleteAgendaItem(id: string): Promise<void> {
    const { data, error } = await db
      .from('agenda_items')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error(translate('svc.noDeletePermission'));
  }

  async getHistory(agendaItemId: string): Promise<AgendaItemHistoryEntry[]> {
    const { data, error } = await db.rpc('get_agenda_item_history', { p_agenda_item_id: agendaItemId });
    if (error) throw error;
    return data ?? [];
  }
}
