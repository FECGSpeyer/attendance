import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from '../../services/db.service';
import { AttendanceType, PersonUnavailability } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { WEEKDAY_LONG, WEEKDAY_SHORT, weekdaysText } from '../../utilities/duty';

/**
 * "Regelmäßig verhindert": weekly rules (e.g. every Wednesday, Kinderstunde).
 * New Termine on a matching weekday get "Entschuldigt" automatically; already
 * planned ones can be updated when saving.
 */
@Component({
  selector: 'app-unavailability-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './unavailability-modal.component.html',
  styleUrls: ['./unavailability-modal.component.scss'],
})
export class UnavailabilityModalComponent implements OnInit {
  @Input() personId!: number;
  @Input() personName = '';
  /** Opened by the leadership for someone else. */
  @Input() forOther = false;

  private readonly db = inject(DbService);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);

  readonly weekdayShort = WEEKDAY_SHORT;
  readonly weekdayLong = WEEKDAY_LONG;
  readonly weekdaysText = weekdaysText;

  rules: PersonUnavailability[] = [];
  types: AttendanceType[] = [];
  loading = true;
  editing: PersonUnavailability | null = null;
  saving = false;

  async ngOnInit(): Promise<void> {
    this.types = this.db.attendanceTypes().filter(t => t.visible !== false);
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      this.rules = await this.db.dutySvc.getUnavailabilityForPerson(this.personId, this.db.tenant().id);
    } catch {
      this.rules = [];
    }
    this.loading = false;
  }

  typesText(rule: PersonUnavailability): string {
    if (!rule.type_ids?.length) return 'alle Termintypen';
    return rule.type_ids.map(id => this.types.find(t => t.id === id)?.name).filter(Boolean).join(', ');
  }

  untilText(rule: PersonUnavailability): string {
    return rule.valid_until ? `bis ${dayjs(rule.valid_until).format('D.M.YYYY')}` : 'unbefristet';
  }

  add(): void {
    const dutyTypeIds = this.types.filter(t => t.duty_mode).map(t => t.id);
    this.editing = {
      tenant_id: this.db.tenant().id,
      person_id: this.personId,
      weekdays: [],
      type_ids: dutyTypeIds,
      reason: '',
      valid_until: null,
    } as PersonUnavailability;
  }

  edit(rule: PersonUnavailability): void {
    this.editing = { ...rule, weekdays: [...rule.weekdays], type_ids: [...(rule.type_ids ?? [])] };
  }

  toggleWeekday(day: number): void {
    const list = this.editing.weekdays;
    this.editing.weekdays = list.includes(day) ? list.filter(d => d !== day) : [...list, day].sort();
  }

  toggleType(id: string): void {
    const list = this.editing.type_ids ?? [];
    this.editing.type_ids = list.includes(id) ? list.filter(t => t !== id) : [...list, id];
  }

  async save(): Promise<void> {
    if (!this.editing?.weekdays.length) {
      Utils.showToast('Bitte wähle mindestens einen Wochentag', 'warning');
      return;
    }
    this.saving = true;
    try {
      const saved = await this.db.dutySvc.saveUnavailability({ ...this.editing, created_by: this.db.user?.id });
      this.editing = null;
      await this.load();
      await this.offerApplyToFuture(saved);
    } finally {
      this.saving = false;
    }
  }

  private async offerApplyToFuture(rule: PersonUnavailability): Promise<void> {
    const tenantId = this.db.tenant().id;
    const { count, dates } = await this.db.dutySvc.countFutureMatches(rule, tenantId, this.types);
    if (!count) {
      Utils.showToast('Gespeichert', 'success');
      return;
    }
    const preview = dates.slice(0, 4).map(d => dayjs(d).format('D.M.')).join(', ') + (count > 4 ? ' …' : '');
    const alert = await this.alertController.create({
      header: 'Auch geplante Termine?',
      message: `${count} schon geplante ${count === 1 ? 'Termin passt' : 'Termine passen'} zu dieser Regel (${preview}). Soll ${this.forOther ? this.personName.split(' ')[0] : 'du'} dort als entschuldigt eingetragen werden? Termine mit eigener Antwort oder Einteilung bleiben unverändert.`,
      buttons: [
        { text: 'Nur neue Termine', role: 'cancel' },
        {
          text: 'Auch geplante',
          handler: async () => {
            const changed = await this.db.dutySvc.applyUnavailabilityToFuture(rule, tenantId, this.types, this.db.user?.id);
            Utils.showToast(`${changed} ${changed === 1 ? 'Termin' : 'Termine'} angepasst`, 'success');
          },
        },
      ],
    });
    await alert.present();
  }

  async remove(rule: PersonUnavailability): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Regel löschen?',
      message: 'Bereits eingetragene Abmeldungen bleiben bestehen.',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            await this.db.dutySvc.deleteUnavailability(rule.id);
            await this.load();
          },
        },
      ],
    });
    await alert.present();
  }

  close(): void {
    this.modalController.dismiss(null, 'close');
  }
}
