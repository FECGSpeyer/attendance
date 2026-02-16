import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { PersonAttendance } from 'src/app/utilities/interfaces';

interface StatusCount {
  status: AttendanceStatus;
  name: string;
  count: number;
  color: string;
}

@Component({
  selector: 'app-status-info',
  templateUrl: './status-info.component.html',
  styleUrls: ['./status-info.component.scss'],
  standalone: false
})
export class StatusInfoComponent implements OnInit {
  @Input() players: PersonAttendance[] = [];

  statusCounts: StatusCount[] = [];
  totalPlayers: number = 0;

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    this.calculateStatusCounts();
  }

  calculateStatusCounts(): void {
    this.totalPlayers = this.players.length;

    const countMap = new Map<AttendanceStatus, number>();

    // Initialize all statuses with 0
    for (const status of this.getAvailableStatuses()) {
      countMap.set(status, 0);
    }

    // Count each status
    for (const player of this.players) {
      const currentCount = countMap.get(player.status) ?? 0;
      countMap.set(player.status, currentCount + 1);
    }

    // Convert to array for display
    this.statusCounts = this.getAvailableStatuses()
      .map(status => ({
        status,
        name: this.getStatusName(status),
        count: countMap.get(status) ?? 0,
        color: this.getStatusColor(status)
      }))
      .filter(item => item.count > 0);
  }

  getAvailableStatuses(): AttendanceStatus[] {
    return [
      AttendanceStatus.Present,
      AttendanceStatus.Excused,
      AttendanceStatus.Late,
      AttendanceStatus.LateExcused,
      AttendanceStatus.Absent,
      AttendanceStatus.Neutral,
    ];
  }

  getStatusName(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return 'Anwesend';
      case AttendanceStatus.Absent:
        return 'Abwesend';
      case AttendanceStatus.Excused:
        return 'Entschuldigt';
      case AttendanceStatus.Late:
        return 'Verspätet';
      case AttendanceStatus.LateExcused:
        return 'Verspätet (entsch.)';
      case AttendanceStatus.Neutral:
        return 'Neutral';
      default:
        return 'Unbekannt';
    }
  }

  getStatusColor(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return 'success';
      case AttendanceStatus.Absent:
        return 'danger';
      case AttendanceStatus.Excused:
        return 'warning';
      case AttendanceStatus.Late:
        return 'tertiary';
      case AttendanceStatus.LateExcused:
        return 'rosa';
      case AttendanceStatus.Neutral:
        return 'medium';
      default:
        return 'medium';
    }
  }

  close(): void {
    this.modalController.dismiss();
  }
}
