import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import dayjs from 'dayjs';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../../utilities/constants';
import { Attendance, AttendanceType, Group, Person, PersonAttendance, Player, PlayerHistoryEntry, ShiftPlan, Tenant, TenantUser } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  constructor() {}

  async getPlayerByAppId(appId: string, tenantId: number, showToast: boolean = true): Promise<Player> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('appId', appId)
      .eq('tenantId', tenantId)
      .single();

    if (error) {
      if (showToast) {
        Utils.showToast("Fehler beim Laden des Benutzers", "danger");
      }
      throw error;
    }

    return {
      ...data,
      history: data.history as any,
    } as any;
  }

  async getPlayerProfile(appId: string, tenantId: number): Promise<Player | null> {
    try {
      const player = await this.getPlayerByAppId(appId, tenantId, false);
      return player;
    } catch (_) {
      return null;
    }
  }

  async getPlayers(tenantId: number, tenantUserRole: Role, parentId?: number, all: boolean = false): Promise<Player[]> {
    if (all) {
      const { data, error } = await supabase
        .from('player')
        .select('*')
        .is('pending', false)
        .eq('tenantId', tenantId);

      if (error) {
        Utils.showToast("Fehler beim Laden der Personen", "danger");
        throw error;
      }

      return data.map((player) => ({
        ...player,
        history: player.history as any,
      })) as any;
    }

    if (tenantUserRole === Role.PARENT) {
      const { data, error } = await supabase
        .from('player')
        .select('*, person_attendances(*)')
        .eq('tenantId', tenantId)
        .is('pending', false)
        .eq('parent_id', parentId)
        .is("left", null)
        .order("instrument")
        .order("isLeader", { ascending: false })
        .order("lastName");

      if (error) {
        Utils.showToast("Fehler beim Laden der Kinder");
        throw error;
      }

      return (data as any).map((player) => ({
        ...player,
        history: player.history.filter((his: PlayerHistoryEntry) =>
          [PlayerHistoryType.PAUSED, PlayerHistoryType.UNPAUSED, PlayerHistoryType.INSTRUMENT_CHANGE].includes(his.type)
        ) as any,
      })) as any;
    }

    const { data, error } = await supabase
      .from('player')
      .select('*, person_attendances(*)')
      .eq('tenantId', tenantId)
      .is("left", null)
      .is('pending', false)
      .order("instrument")
      .order("isLeader", { ascending: false })
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return (data as any).map((player) => ({
      ...player,
      history: player.history as any,
    })) as any;
  }

  async getPlayersByGroup(tenantId: number, groupId: number): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', tenantId)
      .eq('instrument', groupId)
      .is("left", null)
      .is('pending', false)
      .order("isLeader", { ascending: false })
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Gruppenmitglieder", "danger");
      throw error;
    }

    return (data as any).map((player) => ({
      ...player,
      history: player.history as any,
    })) as any;
  }

  async getPendingPersons(tenantId: number): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .is('pending', true)
      .eq('tenantId', tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return data.map((player: any) => ({
      ...player,
      history: player.history as any,
    }));
  }

  async getLeftPlayers(tenantId: number): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .select('*')
      .is('pending', false)
      .eq('tenantId', tenantId)
      .not('left', 'is', null)
      .order("left", { ascending: false });

    return data.map((player: any) => ({
      ...player,
      history: player.history as any,
    }));
  }

  async getPlayersWithoutAccount(tenantId: number): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .select('*')
      .is('pending', false)
      .eq('tenantId', tenantId)
      .not("email", "is", null)
      .is("appId", null)
      .is("left", null);

    return data.map((player: any) => ({
      ...player,
      history: player.history as any,
    })).filter((p: any) => p.email?.length);
  }

  async getConductors(tenantId: number, mainGroupId: number, all: boolean = false): Promise<Person[]> {
    if (!mainGroupId) {
      throw new Error("Hauptgruppe nicht gefunden");
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('instrument', mainGroupId)
      .is('pending', false)
      .eq('tenantId', tenantId)
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Hauptgruppen-Personen", "danger");
      throw new Error("Fehler beim Laden der Personen");
    }

    return (all ? data : data.filter((c: any) => !c.left) as unknown as Person[])
      .map((con: any) => ({ ...con, img: con.img || DEFAULT_IMAGE }));
  }

  async addPlayer(
    player: Player,
    tenantId: number,
    maintainTeachers: boolean
  ): Promise<number> {
    if (!maintainTeachers) {
      delete player.teacher;
    }

    const { data, error } = await supabase
      .from('player')
      .insert({
        ...player,
        tenantId,
        id: Utils.getId(),
        history: player.history as any
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.id;
  }

  async updatePlayer(
    player: Player,
    pausedAction?: boolean,
    createAccount?: boolean,
    updateShifts?: boolean
  ): Promise<Player[]> {
    const dataToUpdate: Player = { ...player };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.groupName;
    delete dataToUpdate.firstOfInstrument;
    delete dataToUpdate.isNew;
    delete dataToUpdate.instrumentLength;
    delete dataToUpdate.teacherName;
    delete dataToUpdate.criticalReasonText;
    delete dataToUpdate.isPresent;
    delete dataToUpdate.text;
    delete dataToUpdate.attStatus;
    delete dataToUpdate.person_attendances;
    delete dataToUpdate.percentage;

    const { data, error } = await supabase
      .from('player')
      .update({
        ...dataToUpdate,
        history: dataToUpdate.history as any,
      })
      .match({ id: player.id })
      .select();

    if (error) {
      throw new Error("Fehler beim updaten des Spielers");
    }

    return data.map((player) => ({
      ...player,
      history: player.history as any,
    })) as unknown as Player[];
  }

  async updatePlayerHistory(id: number, history: PlayerHistoryEntry[]): Promise<any> {
    const { data, error } = await supabase
      .from('player')
      .update({ history: history as any[] })
      .match({ id })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim updaten des Spielers");
    }

    return data;
  }

  /**
   * Update only the additional_fields of a player
   * Used for sanitizing field values after extra fields configuration changes
   */
  async updatePlayerAdditionalFields(id: number, additional_fields: Record<string, any>): Promise<void> {
    const { error } = await supabase
      .from('player')
      .update({ additional_fields })
      .match({ id });

    if (error) {
      throw new Error("Fehler beim updaten der Zusatzfelder");
    }
  }

  async removePlayer(player: Person): Promise<void> {
    await supabase
      .from('player')
      .delete()
      .match({ id: player.id });
  }

  async archivePlayer(player: Player, left: string, notes: string): Promise<void> {
    player.history.push({
      date: new Date().toISOString(),
      text: notes || "Kein Grund angegeben",
      type: PlayerHistoryType.ARCHIVED,
    });

    await supabase
      .from('player')
      .update({ left, history: player.history as any, appId: null })
      .match({ id: player.id });
  }

  async reactivatePlayer(player: Player): Promise<void> {
    player.history.push({
      date: new Date().toISOString(),
      text: "Person wurde reaktiviert",
      type: PlayerHistoryType.RETURNED,
    });

    await supabase
      .from('player')
      .update({ left: null, history: player.history as any })
      .match({ id: player.id });
  }

  async checkAndUnpausePlayers(tenantId: number): Promise<Player[]> {
    const today = dayjs().format('YYYY-MM-DD');

    const { data: pausedPlayers, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', tenantId)
      .eq('paused', true)
      .not('paused_until', 'is', null)
      .lte('paused_until', today);

    if (error) {
      console.error("Fehler beim Prüfen pausierter Personen", error);
      return [];
    }

    const updatedPlayers: Player[] = [];

    for (const player of pausedPlayers || []) {
      const history: PlayerHistoryEntry[] = (player.history as unknown as PlayerHistoryEntry[]) || [];
      history.push({
        date: new Date().toISOString(),
        text: "Automatisch reaktiviert (Pausendatum erreicht)",
        type: PlayerHistoryType.UNPAUSED,
      });

      const updated = await this.updatePlayer({
        ...player,
        paused: false,
        paused_until: null,
        history,
      } as Player, true);

      updatedPlayers.push(...updated);
    }

    return updatedPlayers;
  }

  async updateProfile(appId: string, updates: Partial<Player>): Promise<void> {
    const { error } = await supabase
      .from('player')
      .update(updates as any)
      .match({ appId });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren des Profils", "danger");
      throw error;
    }
  }

  async searchPersonsByName(searchTerm: string, tenantId: number, limit: number = 10): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', tenantId)
      .is('left', null)
      .is('pending', false)
      .or(`firstName.ilike.%${searchTerm}%,lastName.ilike.%${searchTerm}%`)
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map((player: any) => ({
      ...player,
      history: player.history as any,
    }));
  }

  async resetExtraFieldValues(tenantId: number, fieldId: string, defaultValue: any): Promise<number> {
    const { data: players, error } = await supabase
      .from('player')
      .select('id, additional_fields')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    let updatedCount = 0;

    for (const player of players) {
      const extraFieldsData = (player.additional_fields || {}) as Record<string, any>;

      if (fieldId in extraFieldsData) {
        extraFieldsData[fieldId] = defaultValue;

        const { error: updateError } = await supabase
          .from('player')
          .update({ additional_fields: extraFieldsData })
          .eq('id', player.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }

  async updateExtraFieldValue(tenantId: number, fieldId: string, oldValue: any, newValue: any): Promise<number> {
    const { data: players, error } = await supabase
      .from('player')
      .select('id, additional_fields')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    let updatedCount = 0;

    for (const player of players) {
      const extraFieldsData = (player.additional_fields || {}) as Record<string, any>;

      if (extraFieldsData[fieldId] === oldValue) {
        extraFieldsData[fieldId] = newValue;

        const { error: updateError } = await supabase
          .from('player')
          .update({ additional_fields: extraFieldsData })
          .eq('id', player.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }
}
