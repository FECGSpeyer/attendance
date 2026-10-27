import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { translate, TranslocoModule } from '@jsverse/transloco';

export interface DutyCandidate {
  personAttendanceId: string;
  name: string;
  img?: string;
  /** Duties of this person in the month of the Termin. */
  count: number;
  /** Already on duty that day (other Termin). */
  sameDay?: boolean;
  /** Cancelled or regularly unavailable; shown greyed out, still selectable. */
  unavailableNote?: string;
}

/** Sheet "Person einteilen": persons sorted by number of duties, multi-select up to the open places. */
@Component({
  selector: 'app-duty-assign-modal',
  standalone: true,
  imports: [TranslocoModule, CommonModule, IonicModule],
  templateUrl: './duty-assign-modal.component.html',
  styleUrls: ['./duty-assign-modal.component.scss'],
})
export class DutyAssignModalComponent implements OnInit {
  @Input() title = '';
  @Input() openPlaces = 1;
  @Input() candidates: DutyCandidate[] = [];
  @Input() monthLabel = '';

  selected = new Set<string>();
  sorted: DutyCandidate[] = [];

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    this.sorted = [...this.candidates].sort((a, b) =>
      Number(!!a.unavailableNote) - Number(!!b.unavailableNote) ||
      a.count - b.count ||
      a.name.localeCompare(b.name));
  }

  toggle(candidate: DutyCandidate): void {
    if (this.selected.has(candidate.personAttendanceId)) {
      this.selected.delete(candidate.personAttendanceId);
    } else {
      this.selected.add(candidate.personAttendanceId);
    }
  }

  get confirmLabel(): string {
    const names = this.sorted.filter(c => this.selected.has(c.personAttendanceId)).map(c => c.name.split(' ')[0]);
    if (!names.length) return translate('attendance.assign');
    return names.length === 1 ? translate('duty.assignName', { name: names[0] }) : translate('duty.assignPeople', { count: names.length });
  }

  get tooMany(): boolean {
    return this.selected.size > this.openPlaces;
  }

  cancel(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  confirm(): void {
    void this.modalController.dismiss([...this.selected], 'confirm');
  }
}
