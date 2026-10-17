import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonicModule, ModalController, NavController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, AgendaItemPriority, Attendance, AttendanceType, FieldSelection } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { AgendaPickerComponent } from 'src/app/agenda-items/agenda-picker/agenda-picker.component';
import { addTopicsToAttendance, upcomingProtocolAttendances } from 'src/app/agenda-items/agenda-plan.helpers';
import { createAttendanceForType, personsForAttendanceType } from 'src/app/utilities/attendance-create';
import { personName, postponedAgendaItemIds, sortTopicsForPlanning, topNumbers } from '../team-org.utils';
import {
  initials,
  planTops,
  relativeDay,
  splitTopics,
  suggestionStatus,
  TOPIC_PRIORITY_COLORS,
  TOPIC_PRIORITY_LABELS,
} from './topics-tab.utils';

/**
 * Tab "Themen" of the Teamorganisation. Leadership: suggestions to review,
 * the agenda of the next (or a chosen) Termin and the Themenspeicher. Members: their own
 * suggestions and the form to suggest a topic.
 */
@Component({
  selector: 'app-team-topics-tab',
  templateUrl: './topics-tab.component.html',
  styleUrls: ['./topics-tab.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class TeamTopicsTabComponent implements OnInit {
  loading = true;
  items: AgendaItem[] = [];
  pending: AgendaItem[] = [];
  openTopics: AgendaItem[] = [];
  doneTopics: AgendaItem[] = [];
  postponed = new Set<string>();
  showDone = false;

  nextAttendance: Attendance | null = null;
  /** Upcoming Termine with protocol, soonest first; the leadership can switch between them. */
  upcomingAttendances: Attendance[] = [];
  /** Termin chosen via "Ändern"; null = the soonest one. */
  private chosenAttendanceId: number | null = null;
  creatingAttendance = false;
  nextType: AttendanceType | null = null;
  nextTops: FieldSelection[] = [];
  nextTopMinutes = 0;
  private nextNumbers = new Map<string, number>();

  isReviewOpen = false;
  isSuggestOpen = false;
  suggestTitle = '';
  suggestDescription = '';
  sending = false;
  private deciding = new Set<string>();

  readonly priorityLabels = TOPIC_PRIORITY_LABELS;
  readonly priorityColors = TOPIC_PRIORITY_COLORS;
  readonly suggestionStatus = suggestionStatus;
  readonly relativeDay = relativeDay;
  readonly initials = initials;
  readonly personName = personName;

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private navController: NavController,
  ) {}

  get isLeader(): boolean {
    return this.db.isTeamLeader();
  }

  get inCircle(): boolean {
    return this.db.inTeamCircle();
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = !this.items.length;
    try {
      await this.db.loadTeamPerson();
      if (this.isLeader) {
        await this.loadLeader();
      } else if (this.inCircle) {
        // RLS: members only get their own suggestions.
        const items = await this.db.getAgendaItems();
        this.items = items.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      }
    } catch (error) {
      console.error('Topics load error:', error);
      Utils.showToast('Themen konnten nicht geladen werden', 'danger');
    } finally {
      this.loading = false;
    }
  }

  private async loadLeader() {
    const [items, protocols, upcoming] = await Promise.all([
      this.db.getAgendaItems(),
      this.db.getProtocols().catch(() => []),
      this.db.getUpcomingAttendances().catch(() => [] as Attendance[]),
    ]);
    this.items = items;
    this.postponed = postponedAgendaItemIds(protocols);
    const buckets = splitTopics(items);
    this.pending = buckets.pending;
    this.openTopics = sortTopicsForPlanning(buckets.open, this.postponed);
    this.doneTopics = buckets.done;
    if (!this.pending.length) this.isReviewOpen = false;

    this.upcomingAttendances = upcomingProtocolAttendances(upcoming, this.db.attendanceTypes());
    const chosen = this.upcomingAttendances.find(a => a.id === this.chosenAttendanceId);
    if (!chosen) this.chosenAttendanceId = null;
    this.setNextAttendance(chosen ?? this.upcomingAttendances[0] ?? null);
  }

  private setNextAttendance(att: Attendance | null) {
    this.nextAttendance = att;
    this.nextType = att ? this.db.attendanceTypes().find(t => t.id === att.type_id) ?? null : null;
    const { tops, minutes } = planTops(att?.plan?.fields);
    this.nextTops = tops;
    this.nextTopMinutes = minutes;
    this.nextNumbers = topNumbers(att?.plan?.fields);
  }

  topNumber(field: FieldSelection): number {
    return this.nextNumbers.get(field.id) ?? 0;
  }

  get nextTitle(): string {
    return this.nextAttendance ? this.attendanceTitle(this.nextAttendance) : '';
  }

  /** "Nächster Termin" or "Gewählter Termin" when the leadership switched to a later one. */
  get nextHeader(): string {
    return this.nextAttendance && this.nextAttendance.id !== this.upcomingAttendances[0]?.id ? 'Gewählter Termin' : 'Nächster Termin';
  }

  private attendanceTitle(att: Attendance): string {
    const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
    const name = (type ? Utils.getTypeTitle(type, att.typeInfo) : att.typeInfo) || type?.name || 'Termin';
    return `${name} · ${dayjs(att.date).locale('de').format('dd, DD.MM.')}`;
  }

  /** Protocol-enabled types a Termin can be created for ad hoc. */
  private protocolTypes(): AttendanceType[] {
    return this.db.attendanceTypes()
      .filter(t => t.enable_protocol && t.visible !== false)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }

  /** "Ändern": pick another upcoming Termin or create a new one. */
  async changeAttendance() {
    const buttons: ActionSheetButton[] = this.upcomingAttendances.slice(0, 8).map(att => ({
      text: this.attendanceTitle(att) + (att.id === this.nextAttendance?.id ? ' ✓' : ''),
      handler: () => { this.chooseAttendance(att); },
    }));
    buttons.push({ text: 'Neuen Termin anlegen', icon: 'add-circle-outline', handler: () => { void this.createAttendance(); } });
    buttons.push({ text: 'Abbrechen', role: 'cancel' });
    const sheet = await this.actionSheetController.create({ header: 'Für welchen Termin planen?', buttons });
    await sheet.present();
  }

  private chooseAttendance(att: Attendance) {
    this.chosenAttendanceId = att.id;
    this.setNextAttendance(att);
  }

  /** Creates a Termin of a protocol-enabled type ad hoc and selects it. */
  async createAttendance() {
    if (this.creatingAttendance) return;
    const types = this.protocolTypes();
    if (!types.length) {
      Utils.showToast('Kein Termintyp mit Protokoll & Tagesordnung vorhanden', 'warning');
      return;
    }
    const type = types.length === 1 ? types[0] : await this.pickType(types);
    if (!type) return;
    const date = await this.pickDate(type);
    if (!date) return;

    this.creatingAttendance = true;
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      const [persons, absences] = await Promise.all([
        personsForAttendanceType(this.db, type),
        this.db.getPlayerAbsencesForTenant().catch(() => []),
      ]);
      const id = await createAttendanceForType(this.db, type, { date }, persons, absences);
      const created = await this.db.getAttendanceById(id);
      this.chosenAttendanceId = id;
      Utils.showToast(`Termin am ${dayjs(date).format('DD.MM.')} angelegt`, 'success');
      await this.loadLeader();
      if (this.nextAttendance?.id !== id && created) this.chooseAttendance(created);
    } catch (error) {
      console.error('Ad hoc attendance error:', error);
      Utils.showToast('Termin konnte nicht angelegt werden', 'danger');
    } finally {
      await loading.dismiss();
      this.creatingAttendance = false;
    }
  }

  private async pickType(types: AttendanceType[]): Promise<AttendanceType | null> {
    const alert = await this.alertController.create({
      header: 'Welcher Termintyp?',
      inputs: types.map((t, i) => ({ type: 'radio' as const, label: t.name, value: t.id, checked: i === 0 })),
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Weiter', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return null;
    return types.find(t => t.id === data?.values) ?? null;
  }

  private async pickDate(type: AttendanceType): Promise<string | null> {
    const alert = await this.alertController.create({
      header: `${type.name} anlegen`,
      message: 'An welchem Tag findet der Termin statt?',
      inputs: [{ name: 'date', type: 'date', value: dayjs().format('YYYY-MM-DD'), min: dayjs().format('YYYY-MM-DD') }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Anlegen', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const value: string = data?.values?.date ?? '';
    if (role !== 'confirm' || !value) return null;
    if (dayjs(value).isBefore(dayjs(), 'day')) {
      Utils.showToast('Bitte ein Datum ab heute wählen', 'warning');
      return null;
    }
    return dayjs(value).toISOString();
  }

  /** Tap on a TOP: open the topic or take it off this Termin (it stays in the Themenspeicher). */
  async topAction(top: FieldSelection) {
    const sheet = await this.actionSheetController.create({
      header: top.name,
      buttons: [
        { text: 'Thema öffnen', handler: () => { this.openTopic(top.agendaItemId); } },
        { text: 'Aus diesem Termin entfernen', role: 'destructive', handler: () => { void this.removeTop(top); } },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async removeTop(top: FieldSelection) {
    if (!this.nextAttendance || !top.agendaItemId) return;
    try {
      const plan = await addTopicsToAttendance(this.db, this.nextAttendance, this.nextType, [], [top.agendaItemId]);
      this.setNextAttendance({ ...this.nextAttendance, plan });
      this.upcomingAttendances = this.upcomingAttendances.map(a => a.id === this.nextAttendance?.id ? { ...a, plan } : a);
      Utils.showToast('Aus dem Termin entfernt, bleibt im Themenspeicher');
    } catch (error) {
      console.error('Remove TOP error:', error);
      Utils.showToast('Thema konnte nicht entfernt werden', 'danger');
    }
  }

  topicSubtitle(item: AgendaItem): string {
    const parts = [personName(item.responsible_person) || 'Noch niemand verantwortlich'];
    if (item.proposed_by) {
      const by = personName(item.proposer);
      parts.push(by ? `Vorschlag von ${by}` : 'Vorschlag');
    }
    return parts.join(' · ');
  }

  isInNextPlan(item: AgendaItem): boolean {
    return this.nextTops.some(f => f.agendaItemId === item.id);
  }

  openTopic(id: string | undefined) {
    if (id) this.navController.navigateForward(['/tabs/settings/agenda-items', id]);
  }

  openNextAttendance() {
    if (this.nextAttendance) this.navController.navigateForward(['/tabs/attendance', this.nextAttendance.id]);
  }

  addTopic() {
    this.navController.navigateForward(['/tabs/settings/agenda-items', 'new']);
  }

  async openPicker() {
    if (!this.nextAttendance) return;
    const modal = await this.modalController.create({
      component: AgendaPickerComponent,
      componentProps: { attendance: this.nextAttendance, type: this.nextType },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'saved' && data?.plan) {
      const id = this.nextAttendance.id;
      this.setNextAttendance({ ...this.nextAttendance, plan: data.plan });
      this.upcomingAttendances = this.upcomingAttendances.map(a => a.id === id ? { ...a, plan: data.plan } : a);
    }
  }

  // ── Vorschläge prüfen (leadership) ─────────────────────────

  isDeciding(item: AgendaItem): boolean {
    return this.deciding.has(item.id);
  }

  async accept(item: AgendaItem) {
    const alert = await this.alertController.create({
      header: 'Vorschlag übernehmen',
      message: 'Mit welcher Priorität kommt das Thema in den Themenspeicher?',
      inputs: (['high', 'medium', 'low'] as AgendaItemPriority[]).map(p => ({
        type: 'radio' as const,
        label: TOPIC_PRIORITY_LABELS[p],
        value: p,
        checked: p === (item.priority ?? 'medium'),
      })),
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Übernehmen', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const priority = (data?.values as AgendaItemPriority) || item.priority || 'medium';
    await this.decide(item, { proposal_status: 'accepted', priority, decision_note: null }, 'Übernommen');
  }

  async reject(item: AgendaItem) {
    const alert = await this.alertController.create({
      header: 'Vorschlag ablehnen',
      message: `${personName(item.proposer) || 'Die Person'} wird informiert. Eine kurze Begründung hilft.`,
      inputs: [{ name: 'note', type: 'textarea', placeholder: 'Begründung (optional)' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Ablehnen', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const note = (data?.values?.note ?? '').trim();
    await this.decide(item, { proposal_status: 'rejected', decision_note: note || null }, 'Abgelehnt');
  }

  private async decide(item: AgendaItem, changes: Partial<AgendaItem>, doneText: string) {
    if (!item.id || this.deciding.has(item.id)) return;
    this.deciding.add(item.id);
    try {
      await this.db.updateAgendaItem(item.id, changes);
      void this.db.notifyTeam({ type: 'proposal_decided', agendaItemId: item.id });
      Utils.showToast(doneText);
      await this.loadLeader();
    } catch (error) {
      console.error('Proposal decision error:', error);
      Utils.showToast('Entscheidung konnte nicht gespeichert werden', 'danger');
    } finally {
      this.deciding.delete(item.id);
    }
  }

  // ── Thema vorschlagen (members) ────────────────────────────

  openSuggest() {
    this.suggestTitle = '';
    this.suggestDescription = '';
    this.isSuggestOpen = true;
  }

  async sendSuggestion() {
    const title = this.suggestTitle.trim();
    if (!title) {
      Utils.showToast('Bitte einen Titel eingeben', 'warning');
      return;
    }
    if (this.sending) return;
    this.sending = true;
    try {
      await this.db.proposeAgendaItem(title, this.suggestDescription.trim() || undefined);
      this.isSuggestOpen = false;
      Utils.showToast('Vorschlag gesendet', 'success');
      await this.reload();
    } catch (error) {
      console.error('Proposal error:', error);
      Utils.showToast('Vorschlag konnte nicht gesendet werden', 'danger');
    } finally {
      this.sending = false;
    }
  }
}
