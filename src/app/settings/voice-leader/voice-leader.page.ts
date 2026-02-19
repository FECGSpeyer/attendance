import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { ExtraField, Group, PersonAttendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { DEFAULT_IMAGE, AttendanceStatus } from 'src/app/utilities/constants';

interface GroupMember extends Player {
  upcomingAbsences: PersonAttendance[];
}

@Component({
  selector: 'app-voice-leader',
  templateUrl: './voice-leader.page.html',
  styleUrls: ['./voice-leader.page.scss'],
  standalone: false
})
export class VoiceLeaderPage implements OnInit {
  public groupMembers: GroupMember[] = [];
  public groupName: string = '';
  public isLoading: boolean = true;
  public readonly DEFAULT_IMAGE = DEFAULT_IMAGE;
  public einteilungField: ExtraField | undefined;

  constructor(
    public db: DbService,
    private navCtrl: NavController
  ) {}

  async ngOnInit(): Promise<void> {
    // Check if "einteilung" additional field exists
    this.einteilungField = this.db.tenant().additional_fields?.find(
      (field: ExtraField) => field.id === 'einteilung'
    );
    await this.loadGroupMembers();
  }

  async loadGroupMembers(): Promise<void> {
    this.isLoading = true;

    try {
      // Get the current user's player profile
      const currentPlayer = await this.db.getPlayerByAppId(false);

      if (!currentPlayer) {
        Utils.showToast('Kein Spielerprofil gefunden.', 'danger');
        this.navCtrl.back();
        return;
      }

      // Get the group name
      const group = this.db.groups().find((g: Group) => g.id === currentPlayer.instrument);
      this.groupName = group?.name || 'Meine Stimme';

      // Get players from the same group directly from database
      const groupPlayers = await this.db.getPlayersByGroup(currentPlayer.instrument);

      // Load absences for each player
      this.groupMembers = await Promise.all(
        groupPlayers.map(async (player: Player) => {
          const personAttendances = await this.db.getPersonAttendances(player.id, false);

          // Filter for upcoming absences (excused or absent)
          const upcomingAbsences = personAttendances.filter(
            (att: PersonAttendance) =>
              dayjs(att.date).isAfter(dayjs().startOf('day')) &&
              [AttendanceStatus.Excused, AttendanceStatus.Absent, AttendanceStatus.LateExcused].includes(att.status)
          ).sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));

          return {
            ...player,
            img: player.img || DEFAULT_IMAGE,
            upcomingAbsences
          };
        })
      );

      // Sort by lastName, firstName
      this.groupMembers.sort((a, b) => {
        const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '');
        if (lastNameCompare !== 0) return lastNameCompare;
        return (a.firstName || '').localeCompare(b.firstName || '');
      });

    } catch (error) {
      Utils.showToast('Fehler beim Laden der Gruppenmitglieder.', 'danger');
      console.error('Error loading group members:', error);
    } finally {
      this.isLoading = false;
    }
  }

  getEinteilung(member: GroupMember): string | null {
    if (!this.einteilungField || !member.additional_fields) {
      return null;
    }
    return member.additional_fields['einteilung'] || null;
  }

  getAbsenceText(att: PersonAttendance): string {
    const dateStr = dayjs(att.date).format('DD.MM.');
    return att.title ? `${dateStr} ${att.title}` : dateStr;
  }

  getAbsenceColor(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Excused:
      case AttendanceStatus.LateExcused:
        return 'warning';
      case AttendanceStatus.Absent:
        return 'danger';
      default:
        return 'medium';
    }
  }

  async handleRefresh(event: any): Promise<void> {
    await this.loadGroupMembers();
    event.target.complete();
  }
}
