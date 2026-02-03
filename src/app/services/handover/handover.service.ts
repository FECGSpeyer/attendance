import { Injectable } from '@angular/core';
import { Player, Tenant, PlayerHistoryEntry } from '../../utilities/interfaces';
import { DEFAULT_IMAGE, PlayerHistoryType, Role } from '../../utilities/constants';

export interface HandoverResult {
  newPerson: Player;
  historyUpdate: PlayerHistoryEntry;
}

@Injectable({
  providedIn: 'root'
})
export class HandoverService {

  /**
   * Prepares a person for handover to another tenant
   * Returns the new person object and history update for the source person
   */
  prepareHandover(
    person: Player,
    targetTenant: Tenant,
    sourceTenantName: string,
    groupId: number,
    stayInInstance: boolean,
    mainGroup: number | null
  ): HandoverResult {
    const newPerson: Player = {
      tenantId: targetTenant.id,
      firstName: person.firstName,
      lastName: person.lastName,
      instrument: groupId,
      img: person.img || DEFAULT_IMAGE,
      joined: new Date().toISOString(),
      email: person.email,
      appId: person.appId,
      hasTeacher: person.hasTeacher,
      teacher: person.teacher,
      playsSince: person.playsSince,
      correctBirthday: person.correctBirthday,
      birthday: person.birthday,
      isLeader: false,
      isCritical: false,
      notes: person.notes,
      history: [],
      pending: false,
      self_register: false,
    };

    const historyType = stayInInstance ? PlayerHistoryType.COPIED_FROM : PlayerHistoryType.TRANSFERRED_FROM;
    newPerson.history.push({
      date: new Date().toISOString(),
      text: `Person wurde von der Instanz "${sourceTenantName}" übertragen.`,
      type: historyType,
    });

    const sourceHistoryUpdate: PlayerHistoryEntry = {
      date: new Date().toISOString(),
      text: stayInInstance
        ? `Person wurde zu "${targetTenant.longName}" kopiert.`
        : `Person wurde zu "${targetTenant.longName}" übertragen.`,
      type: stayInInstance ? PlayerHistoryType.COPIED_TO : PlayerHistoryType.TRANSFERRED_TO,
    };

    return {
      newPerson,
      historyUpdate: sourceHistoryUpdate,
    };
  }

  /**
   * Gets the appropriate role for a handed-over person
   */
  getHandoverRole(groupId: number, mainGroup: number | null): Role {
    return groupId === mainGroup ? Role.RESPONSIBLE : Role.PLAYER;
  }
}
