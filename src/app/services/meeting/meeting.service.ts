import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Meeting } from '../../utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class MeetingService {

  async getMeetings(tenantId: number): Promise<Meeting[]> {
    const response = await supabase
      .from('meetings')
      .select('*')
      .eq('tenantId', tenantId)
      .order("date", {
        ascending: true,
      });

    return response.data;
  }

  async getMeeting(id: number, tenantId: number): Promise<Meeting> {
    const response = await supabase
      .from('meetings')
      .select('*')
      .match({ id })
      .match({ tenantId })
      .single();

    return response.data;
  }

  async addMeeting(meeting: Meeting, tenantId: number): Promise<Meeting[]> {
    const { data } = await supabase
      .from('meetings')
      .insert({
        ...meeting,
        tenantId
      })
      .select();

    return data;
  }

  async editMeeting(id: number, meeting: Meeting): Promise<Meeting[]> {
    const { data } = await supabase
      .from('meetings')
      .update(meeting)
      .match({ id });

    return data;
  }

  async removeMeeting(id: number): Promise<void> {
    await supabase
      .from('meetings')
      .delete()
      .match({ id });

    return;
  }
}
