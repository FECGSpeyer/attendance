import { Injectable, inject } from '@angular/core';
import { supabase } from '../base/supabase';
import { PersonAttendance } from '../../utilities/interfaces';
import { AttendanceStatus } from '../../utilities/constants';
import { TelegramService } from '../telegram/telegram.service';

@Injectable({
  providedIn: 'root'
})
export class SignInOutService {
  private telegramSvc = inject(TelegramService);

  async signout(
    attIds: string[],
    reason: string,
    isLateExcused: boolean,
    isParents: boolean = false
  ): Promise<void> {
    for (const attId of attIds) {
      await this.updatePersonAttendance(attId, {
        notes: reason,
        status: isLateExcused ? AttendanceStatus.LateExcused : AttendanceStatus.Excused,
      });
    }

    this.telegramSvc.notifyPerTelegram(
      attIds[0],
      isLateExcused === true ? 'lateSignout' : "signout",
      reason,
      isParents
    );
  }

  async signin(
    attId: string,
    status: string,
    notes: string = "",
    userId?: string
  ): Promise<void> {
    await this.updatePersonAttendance(attId, {
      notes,
      status: AttendanceStatus.Present,
    }, userId);

    this.telegramSvc.notifyPerTelegram(attId, status, undefined, false, notes);
  }

  async updateAttendanceNote(attId: string, notes: string, userId?: string): Promise<void> {
    await this.updatePersonAttendance(attId, { notes }, userId);
  }

  async updatePersonAttendance(
    id: string,
    att: Partial<PersonAttendance>,
    userId?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .update({
        ...att,
        changed_by: userId || null,
        changed_at: new Date().toISOString(),
      })
      .match({ id });

    if (error) {
      throw new Error("Fehler beim updaten der Anwesenheit");
    }
  }
}
