import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment.prod';
import { Attendance, Instrument, Person, PersonAttendance, Player } from '../utilities/interfaces';

const supabase = createClient(environment.apiUrl, environment.apiKey);

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private players: Player[] = [];
  private conductors: Person[] = [];
  private instruments: Instrument[] = [];
  private attendance: Attendance[] = [];

  constructor() { }

  async getPlayers(reload: boolean = false): Promise<Player[]> {
    if (this.players.length && !reload) {
      return this.players;
    } else {
      const response = await supabase
        .from<Player>('player')
        .select('*')
        .is("left", null)
        .order("instrument")
        .order("lastName");

      this.players = response.data;
      return this.players;
    }
  }

  async getLeftPlayers(): Promise<Player[]> {
    const response = await supabase
      .from<Player>('player')
      .select('*')
      .not("left", "is", null)
      .order("left", {
        ascending: false,
      });

    return response.data;
  }

  async getConductors(reload: boolean = false): Promise<Person[]> {
    if (this.conductors.length && !reload) {
      return this.conductors;
    } else {
      const response = await supabase
        .from<Person>('conductors')
        .select('*')
        .order("lastName");

      this.conductors = response.data;
      return this.conductors;
    }
  }

  async addPlayer(player: Player): Promise<Player[]> {
    const response = await supabase
      .from<Player>('player')
      .insert(player);

    return response.body;
  }

  async updatePlayer(player: Player): Promise<Player[]> {
    const dataToUpdate: Player = { ...player };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.instrumentName;
    delete dataToUpdate.firstOfInstrument;
    delete dataToUpdate.isNew;
    delete dataToUpdate.instrumentLength;

    const response = await supabase
      .from<Player>('player')
      .update(dataToUpdate)
      .match({ id: player.id });

    return response.body;
  }

  async removePlayer(id: number): Promise<void> {
    await supabase
      .from<Player>('player')
      .delete()
      .match({ id });
  }

  async archivePlayer(id: number): Promise<void> {
    await supabase
      .from<Player>('player')
      .update({ left: new Date().toISOString() })
      .match({ id });
  }

  async getInstruments(reload: boolean = false): Promise<Instrument[]> {
    if (this.instruments.length && !reload) {
      return this.instruments;
    }

    const response = await supabase
      .from<Instrument>('instruments')
      .select('*')
      .order("name");

    this.instruments = response.data;
    return this.instruments;
  }

  async addInstrument(name: string): Promise<Instrument[]> {
    const response = await supabase
      .from<Instrument>('instruments')
      .insert({
        name,
        tuning: "C",
      });

    return response.body;
  }

  async updateInstrument(att: Partial<Instrument>, id: number): Promise<Instrument[]> {
    const response = await supabase
      .from<Instrument>('instruments')
      .update(att)
      .match({ id });

    return response.body;
  }

  async addAttendance(attendance: Attendance): Promise<Attendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .insert(attendance);

    return response.body;
  }

  async getAttendance(reload: boolean = false): Promise<Attendance[]> {
    if (this.attendance.length && !reload) {
      return this.attendance;
    }

    const response = await supabase
      .from<Attendance>('attendance')
      .select('*')
      .order("date", {
        ascending: false,
      });

    this.attendance = response.data;
    return this.attendance;
  }

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .update(att)
      .match({ id });

    return response.body;
  }

  async removeAttendance(id: number): Promise<void> {
    await supabase
      .from<Attendance>('attendance')
      .delete()
      .match({ id });
  }

  async getPlayerAttendance(id: number): Promise<PersonAttendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .select('*')
      .neq(`players->"${id}"` as any, null)
      .order("date", {
        ascending: false,
      });

    return response.body.map((att: Attendance): PersonAttendance => {
      return {
        id,
        date: att.date,
        attended: att.players[id],
      }
    });
  }
}
