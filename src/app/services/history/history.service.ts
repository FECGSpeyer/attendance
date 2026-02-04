import { Injectable } from '@angular/core';
import { History, Song } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';
import dayjs from 'dayjs';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {

  constructor() {}

  async getHistory(tenantId: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*, attendance:attendance_id(date)')
      .eq('tenantId', tenantId)
      .eq('visible', true)
      .order("date", { ascending: false });

    return data as any;
  }

  async getHistoryByAttendanceId(attendanceId: number, tenantId: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*')
      .eq('tenantId', tenantId)
      .eq('attendance_id', attendanceId)
      .order("songId", { ascending: true });

    return data;
  }

  async updateHistoryEntry(id: number, history: Partial<History>): Promise<History[]> {
    const { data, error } = await supabase
      .from('history')
      .update(history)
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Updaten des Eintrags", "danger");
      throw new Error("Fehler beim Updaten des Eintrags");
    }

    return data;
  }

  async addHistoryEntry(history: History[], tenantId: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .insert(history.map((h: History) => ({ ...h, tenantId })))
      .select();

    return data;
  }

  async removeHistoryEntry(id: number): Promise<History[]> {
    const { data, error } = await supabase
      .from('history')
      .delete()
      .match({ id });

    if (error) {
      throw new Error("Fehler beim Löschen des Eintrags");
    }

    return data;
  }

  async addSongsToHistory(historyEntries: History[]): Promise<void> {
    const { error } = await supabase
      .from('history')
      .insert(historyEntries)
      .select();

    if (error) {
      throw new Error("Fehler beim Hinzufügen der Lieder zur Historie");
    }
  }

  async getUpcomingHistory(tenantId: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*, song:songId(*), attendance:attendance_id(date, type_id)')
      .eq('tenantId', tenantId)
      .gte('date', dayjs().startOf('day').toISOString())
      .order("date", { ascending: true });

    return (data || []).filter((h: any) => h.song) as unknown as History[];
  }

  async getCurrentSongs(tenantId: number): Promise<{ song: Song; date: string; attendanceId: number }[]> {
    const { data } = await supabase
      .from('history')
      .select('*, song:songId(*), attendance:attendance_id(date, type_id)')
      .eq('tenantId', tenantId)
      .gte('date', dayjs().startOf('day').toISOString())
      .lte('date', dayjs().add(14, 'day').toISOString())
      .order("date", { ascending: true });

    return (data || [])
      .filter((h: any) => h.song)
      .map((h: any) => ({
        song: h.song,
        date: h.date,
        attendanceId: h.attendance_id,
      }));
  }
}
