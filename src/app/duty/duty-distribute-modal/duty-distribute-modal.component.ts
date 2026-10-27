import { currentLanguage, dateFmt } from '../../i18n/languages';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, LoadingController, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { DbService } from '../../services/db.service';
import { DutyTermin } from '../../services/duty/duty.service';
import { AttendanceType, PersonAttendance, PersonUnavailability } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { DutySlot, distributeDuties, isCancelled, matchingUnavailability, occupiesDuty } from '../../utilities/duty';
import { translate, TranslocoModule } from '@jsverse/transloco';

interface PreviewRow {
  termin: DutyTermin;
  /** Already occupying persons (kept as they are). */
  existing: PersonAttendance[];
  /** Newly picked persons of this run. */
  picked: PersonAttendance[];
  candidates: PersonAttendance[];
  missing: number;
}

/**
 * "Dienste verteilen": fills the open places of duty Termine in a period
 * fairly (fewest duties first), shows a preview that can be changed, and
 * assigns on save (everyone gets a push and confirms as usual).
 */
@Component({
  selector: 'app-duty-distribute-modal',
  standalone: true,
  imports: [TranslocoModule, CommonModule, FormsModule, IonicModule],
  templateUrl: './duty-distribute-modal.component.html',
  styleUrls: ['./duty-distribute-modal.component.scss'],
})
export class DutyDistributeModalComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly loadingController = inject(LoadingController);

  step: 'rules' | 'preview' = 'rules';
  dutyTypes: AttendanceType[] = [];
  selectedTypeIds: string[] = [];
  from = dayjs().add(1, 'month').startOf('month').format('YYYY-MM-DD');
  to = dayjs().add(1, 'month').endOf('month').format('YYYY-MM-DD');
  maxPerPerson = 2;
  notTwiceSameDay = true;

  rows: PreviewRow[] = [];
  private termine: DutyTermin[] = [];
  private baseCounts = new Map<number, number>();
  private unavailability: PersonUnavailability[] = [];
  saving = false;

  ngOnInit(): void {
    this.dutyTypes = this.db.attendanceTypes().filter(t => t.duty_mode);
    this.selectedTypeIds = this.dutyTypes.map(t => t.id);
  }

  toggleType(id: string): void {
    this.selectedTypeIds = this.selectedTypeIds.includes(id)
      ? this.selectedTypeIds.filter(t => t !== id)
      : [...this.selectedTypeIds, id];
  }

  changeMax(delta: number): void {
    this.maxPerPerson = Math.max(1, Math.min(10, this.maxPerPerson + delta));
  }

  async calculate(): Promise<void> {
    if (!this.selectedTypeIds.length) {
      Utils.showToast(translate('duty.chooseTypeMin'), 'warning');
      return;
    }
    const loading = await this.loadingController.create({ message: translate('duty.distributing') });
    await loading.present();
    try {
      const tenantId = this.db.tenant().id;
      const types = this.dutyTypes.filter(t => this.selectedTypeIds.includes(t.id));
      const fromIso = dayjs(this.from.slice(0, 10)).startOf('day').toISOString();
      const toIso = dayjs(this.to.slice(0, 10)).endOf('day').toISOString();
      const [termine, unavailability] = await Promise.all([
        this.db.dutySvc.getUpcomingDutyTermine(tenantId, types, toIso, (dayjs(fromIso).isBefore(dayjs().startOf('day')) ? dayjs().startOf('day') : dayjs(fromIso)).toISOString()),
        this.db.dutySvc.getUnavailabilityForTenant(tenantId),
      ]);
      this.termine = termine;
      const personIds = Array.from(new Set(termine.flatMap(t => t.persons.map(p => p.person_id))));
      // Fairness looks at the whole period, also at duties of other duty types.
      this.baseCounts = await this.db.dutySvc.getDutyCounts(personIds, fromIso, toIso, this.dutyTypes.map(t => t.id));

      this.unavailability = unavailability;
      this.run();
      this.step = 'preview';
    } finally {
      await loading.dismiss();
    }
  }

  private candidatesOf(t: DutyTermin): PersonAttendance[] {
    return t.persons.filter(p =>
      !p.duty_state &&
      !isCancelled(p) &&
      !matchingUnavailability(this.unavailability, p.person_id, t.attendance.date, t.attendance.type_id));
  }

  /** (Re-)runs the distribution; ties are random, so every run can differ. */
  run(): void {
    const slots: DutySlot[] = this.termine
      .filter(t => t.occupied < t.required)
      .map(t => ({
        attendanceId: t.attendance.id,
        date: t.attendance.date,
        candidates: this.candidatesOf(t).map(p => p.person_id),
        occupied: t.persons.filter(occupiesDuty).map(p => p.person_id),
        open: t.required - t.occupied,
      }));
    const result = distributeDuties(slots, this.baseCounts, { maxPerPerson: this.maxPerPerson, notTwiceSameDay: this.notTwiceSameDay });

    this.rows = this.termine.map(t => {
      const pickedIds = result.get(t.attendance.id) ?? [];
      const picked = pickedIds.map(id => t.persons.find(p => p.person_id === id)).filter(Boolean);
      const existing = t.persons.filter(occupiesDuty);
      return {
        termin: t,
        existing,
        picked,
        candidates: this.candidatesOf(t),
        missing: Math.max(0, t.required - existing.length - picked.length),
      };
    });
  }

  name(pa: PersonAttendance): string {
    const person = (pa as any).person;
    return person ? `${person.firstName} ${person.lastName}`.trim() : '';
  }

  firstName(pa: PersonAttendance): string {
    return (pa as any).person?.firstName ?? '';
  }

  dateLabel(t: DutyTermin): string {
    const time = (t.attendance.start_time ?? t.type?.start_time ?? '').slice(0, 5);
    return dayjs(t.attendance.date).locale(currentLanguage()).format(`dd, ${dateFmt('dayMonth')}`) + (time ? ` · ${time}` : '');
  }

  title(t: DutyTermin): string {
    return t.attendance.typeInfo || t.type?.name || translate('duty.duty');
  }

  /** Duties per person id: existing in the period plus planned in this run. */
  private countsById(): Map<number, { count: number; planned: number }> {
    const result = new Map<number, { count: number; planned: number }>();
    for (const [id, n] of this.baseCounts) result.set(id, { count: n, planned: 0 });
    for (const row of this.rows) {
      for (const pa of row.picked) {
        const entry = result.get(pa.person_id) ?? { count: 0, planned: 0 };
        entry.count++;
        entry.planned++;
        result.set(pa.person_id, entry);
      }
    }
    return result;
  }

  get personCounts(): { name: string; count: number; planned: number }[] {
    const names = new Map<number, string>();
    for (const t of this.termine) for (const p of t.persons) names.set(p.person_id, this.name(p));
    return [...this.countsById()]
      .filter(([id]) => names.has(id))
      .map(([id, c]) => ({ name: names.get(id), ...c }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  get plannedTotal(): number {
    return this.rows.reduce((sum, r) => sum + r.picked.length, 0);
  }

  get missingTotal(): number {
    return this.rows.reduce((sum, r) => sum + r.missing, 0);
  }

  /** Swap or remove a picked person, or fill a still missing place. */
  async change(row: PreviewRow, current?: PersonAttendance): Promise<void> {
    const taken = new Set(row.picked.map(p => p.person_id));
    const options = row.candidates.filter(c => !taken.has(c.person_id));
    const counts = this.countsById();
    const countOf = (pa: PersonAttendance) => counts.get(pa.person_id)?.count ?? 0;
    const inputs: any[] = options
      .sort((a, b) => countOf(a) - countOf(b) || this.name(a).localeCompare(this.name(b)))
      .map(c => ({ type: 'radio', label: `${this.name(c)} (${countOf(c)})`, value: c.id }));
    if (current) {
      inputs.unshift({ type: 'radio', label: translate('duty.nobody'), value: '__none' });
    }
    if (!inputs.length) {
      Utils.showToast(translate('duty.nobodyElse'), 'warning');
      return;
    }
    const alert = await this.alertController.create({
      header: current ? translate('duty.swap', { name: this.firstName(current) }) : translate('duty.choosePerson'),
      subHeader: `${this.title(row.termin)} · ${this.dateLabel(row.termin)}`,
      inputs,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.apply'),
          handler: (value: string) => {
            if (!value) return;
            const next = value === '__none' ? null : options.find(o => o.id === value);
            row.picked = row.picked.filter(p => p !== current);
            if (next) row.picked.push(next);
            row.missing = Math.max(0, row.termin.required - row.existing.length - row.picked.length);
          },
        },
      ],
    });
    await alert.present();
  }

  async save(): Promise<void> {
    if (!this.plannedTotal) {
      this.modalController.dismiss(null, 'cancel');
      return;
    }
    this.saving = true;
    const loading = await this.loadingController.create({ message: translate('duty.assigning') });
    await loading.present();
    try {
      const tenantId = this.db.tenant().id;
      for (const row of this.rows.filter(r => r.picked.length)) {
        await this.db.dutySvc.assign(row.picked.map(p => p.id), row.termin.attendance.id, tenantId, this.db.user?.id);
      }
      Utils.showToast(translate('duty.assignedToast', { count: this.plannedTotal }), 'success', 4000);
      await this.modalController.dismiss(true, 'confirm');
    } finally {
      this.saving = false;
      await loading.dismiss();
    }
  }

  back(): void {
    this.step = 'rules';
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
