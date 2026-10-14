import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, Attendance, AttendanceType, Plan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { agendaFieldId, personName, postponedAgendaItemIds, sortTopicsForPlanning } from 'src/app/team-organization/team-org.utils';
import { addTopicsToAttendance, defaultTopicDuration, insertAfterName, planWithTopics } from '../agenda-plan.helpers';

interface PickerRow {
  item: AgendaItem;
  selected: boolean;
  duration: number;
  /** Already in this Termin's plan: shown checked and disabled. */
  inPlan: boolean;
  postponedOn?: string;
}

/**
 * "Themen aufnehmen": picks open topics (and creates new ones inline) and
 * inserts them as TOPs into a Termin's Ablaufplan. Dismisses with
 * `{ data: { plan }, role: 'saved' }` after saving.
 */
@Component({
  selector: 'app-agenda-picker',
  templateUrl: './agenda-picker.component.html',
  styleUrls: ['./agenda-picker.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AgendaPickerComponent implements OnInit {
  @Input() attendance!: Attendance;
  @Input() type?: AttendanceType;

  public loading = true;
  public saving = false;
  public search = '';
  public postponedRows: PickerRow[] = [];
  public otherRows: PickerRow[] = [];

  readonly priorityLabels = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' } as const;

  constructor(private db: DbService, private modalController: ModalController) {}

  async ngOnInit() {
    this.type = this.type ?? this.db.attendanceTypes().find(t => t.id === this.attendance?.type_id);
    try {
      const [items, protocols] = await Promise.all([this.db.getAgendaItems(), this.db.getProtocols()]);
      const postponed = postponedAgendaItemIds(protocols);
      const postponedDate = new Map<string, string>();
      for (const p of protocols) {
        for (const [fieldId, outcome] of Object.entries(p.outcomes ?? {})) {
          const id = fieldId.replace(/^agenda-/, '');
          if (outcome === 'postponed' && postponed.has(id) && !postponedDate.has(id) && p.attendance?.date) {
            postponedDate.set(id, p.attendance.date);
          }
        }
      }
      const inPlan = new Set((this.attendance?.plan?.fields ?? []).map(f => f.agendaItemId).filter(Boolean));
      const usePostponedSection = this.type?.suggest_postponed !== false;
      const sorted = sortTopicsForPlanning(items, usePostponedSection ? postponed : new Set());
      const rows = sorted.map((item): PickerRow => ({
        item,
        selected: inPlan.has(item.id),
        inPlan: inPlan.has(item.id),
        duration: this.durationInPlan(item) ?? defaultTopicDuration(item, this.type),
        postponedOn: postponed.has(item.id) ? postponedDate.get(item.id) ?? '' : undefined,
      }));
      this.postponedRows = usePostponedSection ? rows.filter(r => r.postponedOn !== undefined) : [];
      this.otherRows = usePostponedSection ? rows.filter(r => r.postponedOn === undefined) : rows;
    } catch (e) {
      console.error('agenda picker load failed', e);
      Utils.showToast('Themen konnten nicht geladen werden', 'danger');
    } finally {
      this.loading = false;
    }
  }

  private durationInPlan(item: AgendaItem): number | undefined {
    const field = this.attendance?.plan?.fields?.find(f => f.id === agendaFieldId(item.id));
    return field ? Number(field.time) || undefined : undefined;
  }

  private matches(row: PickerRow): boolean {
    const term = this.search.trim().toLowerCase();
    return !term || row.item.title.toLowerCase().includes(term) || (row.item.description ?? '').toLowerCase().includes(term);
  }

  get visiblePostponed(): PickerRow[] { return this.postponedRows.filter(r => this.matches(r)); }
  get visibleOthers(): PickerRow[] { return this.otherRows.filter(r => this.matches(r)); }

  get canCreateFromSearch(): boolean {
    const term = this.search.trim().toLowerCase();
    return !!term && ![...this.postponedRows, ...this.otherRows].some(r => r.item.title.trim().toLowerCase() === term);
  }

  get newSelections(): PickerRow[] {
    return [...this.postponedRows, ...this.otherRows].filter(r => r.selected && !r.inPlan);
  }

  get totalMinutes(): number {
    return this.newSelections.reduce((s, r) => s + r.duration, 0);
  }

  get insertHint(): string {
    const after = insertAfterName(this.attendance?.plan?.fields);
    const where = after ? `Wird nach „${after}“ eingefügt` : 'Wird am Anfang eingefügt';
    if (!this.newSelections.length) return where;
    const plan = this.previewPlan();
    const end = dayjs(plan.end).isValid() ? dayjs(plan.end).format('HH:mm') : '';
    return end ? `${where} · Ende neu ${end}` : where;
  }

  private previewPlan(): Plan {
    return planWithTopics(this.attendance, this.type, this.newSelections.map(r => ({ item: r.item, duration: r.duration })));
  }

  subtitle(row: PickerRow): string {
    const parts: string[] = [];
    const responsible = personName(row.item.responsible_person);
    if (responsible) parts.push(responsible);
    parts.push(this.priorityLabels[row.item.priority] ?? '');
    if (row.inPlan) parts.push('bereits im Ablaufplan');
    return parts.filter(Boolean).join(' · ');
  }

  toggle(row: PickerRow) {
    if (row.inPlan) return;
    row.selected = !row.selected;
  }

  changeDuration(row: PickerRow, delta: number, event?: Event) {
    event?.stopPropagation();
    row.duration = Math.max(5, row.duration + delta);
  }

  async createFromSearch() {
    const title = this.search.trim();
    if (!title) return;
    try {
      const item = await this.db.addAgendaItem({
        tenant_id: this.db.tenant().id,
        title,
        status: 'open',
        priority: 'medium',
      });
      this.otherRows = [{ item, selected: true, inPlan: false, duration: defaultTopicDuration(item, this.type) }, ...this.otherRows];
      this.search = '';
    } catch (e) {
      console.error('agenda item create failed', e);
      Utils.showToast('Thema konnte nicht angelegt werden', 'danger');
    }
  }

  dismiss() {
    this.modalController.dismiss(null, 'cancel');
  }

  async confirm() {
    const selections = this.newSelections.map(r => ({ item: r.item, duration: r.duration }));
    if (!selections.length || this.saving) return;
    this.saving = true;
    try {
      const plan = await addTopicsToAttendance(this.db, this.attendance, this.type, selections);
      Utils.showToast(selections.length === 1 ? 'Thema aufgenommen' : `${selections.length} Themen aufgenommen`, 'success');
      await this.modalController.dismiss({ plan }, 'saved');
    } catch (e) {
      console.error('agenda picker save failed', e);
      Utils.showToast('Ablaufplan konnte nicht gespeichert werden', 'danger');
    } finally {
      this.saving = false;
    }
  }
}
