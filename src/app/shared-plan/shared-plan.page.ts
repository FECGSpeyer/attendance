import { currentLanguage, dateFmt } from '../i18n/languages';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { AlertController, ActionSheetController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { Attendance, FieldSelection, Plan, SharedPlan } from '../utilities/interfaces';
import { allPlans, planDate, planLabel, splitPlans, todayPlanIndex } from '../utilities/plan-days';
import { Utils } from '../utilities/Utils';
import { moveRow, normalizeGroups } from '../utilities/plan-groups';
import { PUBLIC_BRANDINGS } from '../public-planning/public-planning-templates';
import { getSupabase } from '../services/base/supabase';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-shared-plan',
  templateUrl: './shared-plan.page.html',
  styleUrls: ['./shared-plan.page.scss'],
  standalone: false,
})
export class SharedPlanPage implements OnInit, OnDestroy {
  public loading = true;
  public notFound = false;
  public isEditMode = false;

  // Attendance plan mode (?id + ?key)
  public attendanceId: number | null = null;
  public attendanceDate: string | null = null;
  public attendancePlanTitle: string | null = null;
  /** The Termin's plans when it has several (e.g. one per day). */
  private attData: Partial<Attendance> | null = null;
  public planLabels: string[] = [];
  public planIndex = 0;
  public todayIndex = -1;

  // Shared plan mode (?key only)
  public sharedPlan: SharedPlan | null = null;

  public planTitle = '';
  public date = '';
  public time = '';
  public end = '';
  public fields: FieldSelection[] = [];
  public brandingId = 'none';

  public liveMode = false;
  public activeFieldIndex = -1;
  private liveInterval: any;
  private realtimeSub: RealtimeChannel;

  constructor(
    private route: ActivatedRoute,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) {}

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const id = params.get('id');
    const key = params.get('key');
    const editKey = params.get('edit');

    if (!key) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    if (id) {
      await this.loadAttendancePlan(Number(id), key, editKey);
    } else {
      await this.loadSharedPlan(key, editKey);
    }

    this.loading = false;

    if (this.isLiveNow()) {
      this.toggleLive();
    }
  }

  ngOnDestroy() {
    this.stopLive();
    this.realtimeSub?.unsubscribe();
  }

  private async loadAttendancePlan(id: number, key: string, editKey: string | null) {
    const { data } = await getSupabase()
      .from('attendance')
      .select('id, date, duration_days, plan, extra_plans, type_id, typeInfo, share_key, share_edit_key')
      .eq('id', id)
      .eq('share_key', key)
      .single();

    if (!data || !data.plan) {
      this.notFound = true;
      return;
    }

    this.attendanceId = data.id;
    this.attendanceDate = data.date;
    this.attData = data as unknown as Partial<Attendance>;
    const plans = allPlans(this.attData);
    if (plans.length > 1) {
      this.planLabels = plans.map((_, i) => planLabel(this.attData, i, plans));
      this.planIndex = todayPlanIndex(this.attData);
      this.todayIndex = planDate(this.attData, this.planIndex, plans).isSame(dayjs(), 'day') ? this.planIndex : -1;
    }
    this.applyAttendancePlan();

    if (editKey && editKey === (data as any).share_edit_key) {
      this.isEditMode = true;
      this.subscribeAttendanceRealtime(id);
    }
  }

  /** Shows the selected plan of the Termin (the first one when there's just one). */
  private applyAttendancePlan() {
    if (!this.attData) { return; }
    const plans = allPlans(this.attData);
    const plan: any = plans[this.planIndex] ?? this.attData.plan;
    this.planTitle = plan.title || (this.attData as any).typeInfo || '';
    this.date = this.planIndex > 0 ? planDate(this.attData, this.planIndex, plans).format('YYYY-MM-DD') : this.attData.date;
    this.time = plan.time || '';
    this.end = plan.end || '';
    this.fields = plan.fields || [];
  }

  selectPlan(index: number) {
    this.stopLive();
    this.planIndex = index;
    this.applyAttendancePlan();
    if (this.isLiveNow()) { this.toggleLive(); }
  }

  private async loadSharedPlan(key: string, editKey: string | null) {
    const { data } = await getSupabase()
      .from('shared_plans')
      .select('*')
      .eq('id', key)
      .single();

    if (!data) {
      this.notFound = true;
      return;
    }

    this.sharedPlan = data as unknown as SharedPlan;
    this.planTitle = data.plan_title || translate('plans.runSheet');
    this.date = data.date || '';
    this.time = data.time || '';
    this.end = data.end_time || '';
    this.fields = (data.fields as unknown as FieldSelection[]) || [];
    this.brandingId = data.branding_id || 'none';

    if (editKey && editKey === data.edit_key) {
      this.isEditMode = true;
      this.subscribeSharedPlanRealtime(key);
    }
  }

  private subscribeAttendanceRealtime(id: number) {
    this.realtimeSub?.unsubscribe();
    this.realtimeSub = getSupabase()
      .channel(`shared-att-${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'attendance', filter: `id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const plan = payload.new?.plan;
          if (plan && this.attData) {
            this.attData = { ...this.attData, plan, extra_plans: payload.new?.extra_plans ?? null };
            const plans = allPlans(this.attData);
            this.planLabels = plans.length > 1 ? plans.map((_, i) => planLabel(this.attData, i, plans)) : [];
            this.planIndex = Math.min(this.planIndex, plans.length - 1);
            this.applyAttendancePlan();
            if (this.liveMode) { this.updateActiveIndex(); }
          }
        })
      .subscribe();
  }

  private subscribeSharedPlanRealtime(key: string) {
    this.realtimeSub?.unsubscribe();
    this.realtimeSub = getSupabase()
      .channel(`shared-plan-${key}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shared_plans', filter: `id=eq.${key}` },
        (payload: RealtimePostgresChangesPayload<any>) => {
          const d = payload.new;
          if (d) {
            this.planTitle = d.plan_title || this.planTitle;
            this.time = d.time || this.time;
            this.end = d.end_time || this.end;
            this.fields = (d.fields as unknown as FieldSelection[]) || this.fields;
            if (this.liveMode) { this.updateActiveIndex(); }
          }
        })
      .subscribe();
  }

  // ---- time helpers ----

  getDateFormatted(): string {
    if (!this.date) { return this.planTitle; }
    return dayjs(this.date).locale(currentLanguage()).format(`dddd, ${dateFmt()}`);
  }

  getStartTime(): string {
    if (!this.time) { return ''; }
    const t = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return t.format('HH:mm');
  }

  getEndTime(): string {
    if (!this.end) { return ''; }
    const t = dayjs(this.end).isValid()
      ? dayjs(this.end)
      : dayjs().hour(Number(this.end.substring(0, 2))).minute(Number(this.end.substring(3, 5)));
    return t.format('HH:mm');
  }

  calculateTime(field: FieldSelection, index: number): string {
    let minutesToAdd = 0;
    for (let i = 0; i < index; i++) {
      minutesToAdd += Number(this.fields[i].time) || 0;
    }
    const t = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    const result = t.add(minutesToAdd, 'minute').format('HH:mm');
    return field.conductor ? `${result} | ${field.conductor}` : result;
  }

  getActiveCountdown(): string {
    if (!this.liveMode || this.activeFieldIndex < 0 || !this.fields.length || !this.time || !this.date) { return ''; }
    const startBase = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    let t = dayjs(this.date).hour(startBase.hour()).minute(startBase.minute()).second(0);
    for (let i = 0; i <= this.activeFieldIndex; i++) {
      t = t.add(Number(this.fields[i].time) || 0, 'minute');
    }
    const remaining = Math.max(0, t.diff(dayjs(), 'second'));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---- live viewer ----

  isLiveNow(): boolean {
    if (!this.date || !this.time || !this.fields.length) { return false; }
    const now = dayjs();
    const startBase = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    const start = dayjs(this.date)
      .hour(startBase.hour())
      .minute(startBase.minute())
      .second(0);
    const totalMinutes = this.fields.reduce((s, f) => s + (Number(f.time) || 0), 0);
    const end = start.add(totalMinutes, 'minute');
    return now.isAfter(start.subtract(5, 'minute')) && now.isBefore(end.add(15, 'minute'));
  }

  toggleLive() {
    this.liveMode = !this.liveMode;
    if (this.liveMode) {
      this.updateActiveIndex();
      this.liveInterval = setInterval(() => this.updateActiveIndex(), 1000);
    } else {
      this.stopLive();
    }
  }

  private stopLive() {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }
    this.activeFieldIndex = -1;
  }

  updateActiveIndex() {
    if (!this.fields.length || !this.time || !this.date) {
      this.activeFieldIndex = -1;
      return;
    }
    const now = dayjs();
    const startBase = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    let t = dayjs(this.date).hour(startBase.hour()).minute(startBase.minute()).second(0);
    for (let i = 0; i < this.fields.length; i++) {
      t = t.add(Number(this.fields[i].time) || 0, 'minute');
      if (now.isBefore(t)) {
        this.activeFieldIndex = i;
        this.scrollToActive();
        return;
      }
    }
    this.activeFieldIndex = this.fields.length - 1;
    this.scrollToActive();
  }

  private hasAutoScrolled = false;

  private scrollToActive() {
    if (this.hasAutoScrolled) { return; }
    setTimeout(() => {
      const el = document.querySelector('.active-slot');
      if (!el) { return; }
      this.hasAutoScrolled = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  // ---- edit mode ----

  async editTitle() {
    if (!this.isEditMode) { return; }
    const alert = await this.alertController.create({
      header: translate('plans.editTitle'),
      inputs: [{ type: 'text', name: 'title', value: this.planTitle, placeholder: translate('plans.title') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.title?.trim()) { return false; }
            this.planTitle = evt.title.trim();
            this.saveEdits();
          }
        },
      ],
    });
    await alert.present();
  }

  async addField(popover?: any) {
    popover?.dismiss();
    if (!this.isEditMode) { return; }
    const alert = await this.alertController.create({
      header: translate('planning.addField'),
      inputs: [
        { type: 'textarea', name: 'field', placeholder: translate('planning.enterItem') },
        { type: 'textarea', name: 'conductor', placeholder: translate('plans.performerOptional') },
        { type: 'textarea', name: 'info', placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) { return false; }
            this.fields.push({
              id: `${evt.field.trim()}-${Date.now()}`,
              name: evt.field.trim(),
              conductor: evt.conductor?.trim() ?? '',
              info: evt.info?.trim() || undefined,
              time: '20',
            });
            this.saveEdits();
          }
        },
      ],
    });
    await alert.present();
  }

  async addNote(popover?: any) {
    popover?.dismiss();
    if (!this.isEditMode) { return; }
    const alert = await this.alertController.create({
      header: translate('attendance.addNote'),
      inputs: [{ type: 'textarea', name: 'text', placeholder: translate('planning.enterNote') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.text?.trim()) { return false; }
            this.fields.push({
              id: `noteFld ${evt.text.trim()}-${Date.now()}`,
              name: evt.text.trim(),
              conductor: '',
              time: '0',
            });
            this.saveEdits();
          }
        },
      ],
    });
    await alert.present();
  }

  handleReorder(ev: CustomEvent<any>) {
    const { from, to } = ev.detail;
    // A block head moves together with its Unterpunkte, so the list is rebuilt instead of letting Ionic move one row.
    ev.detail.complete(false);
    this.fields = moveRow(this.fields, this.fields.map((_, i) => i), from, to);
    this.saveEdits();
  }

  removeField(index: number) {
    if (!this.isEditMode) { return; }
    this.fields.splice(index, 1);
    // Removing a block head turns its Unterpunkte into normal fields.
    normalizeGroups(this.fields);
    this.saveEdits();
  }

  async editStartTime() {
    if (!this.isEditMode) { return; }
    const current = this.getStartTime();
    const alert = await this.alertController.create({
      header: translate('plans.editStartTime'),
      inputs: [{ type: 'time', name: 'time', value: current }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.time) { return false; }
            this.time = this.date ? `${this.date}T${evt.time}` : evt.time;
            this.saveEdits();
          }
        },
      ],
    });
    await alert.present();
  }

  async editField(field: FieldSelection) {
    if (!this.isEditMode) { return; }
    const isNote = field.id.includes('noteFld');
    const inputs: any[] = isNote
      ? [{ type: 'textarea', name: 'field', value: field.name, placeholder: translate('planning.note') }]
      : [
          { type: 'textarea', name: 'field', value: field.name, placeholder: translate('planning.item') },
          { type: 'textarea', name: 'conductor', value: field.conductor, placeholder: translate('planning.performer') },
          { type: 'textarea', name: 'info', value: field.info, placeholder: translate('planning.infoOptional') },
          { type: 'number', name: 'time', value: field.time, placeholder: translate('plans.durationMin') },
        ];
    const alert = await this.alertController.create({
      header: translate('planning.editField'),
      inputs,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.field) { return false; }
            field.name = evt.field;
            if (!isNote) {
              field.conductor = evt.conductor ?? '';
              field.info = evt.info?.trim() || undefined;
              if (evt.time) { field.time = String(evt.time); }
            }
            this.saveEdits();
          }
        },
      ],
    });
    await alert.present();
  }

  private async saveEdits() {
    try {
      if (this.attendanceId) {
        const plans = allPlans(this.attData);
        const edited: Plan = { ...(plans[this.planIndex] ?? {}), time: this.time, end: this.end, fields: this.fields, title: this.planTitle || undefined };
        const update = plans.length > 1
          ? splitPlans(plans.map((p, i) => i === this.planIndex ? edited : p))
          : { plan: edited };
        await getSupabase().from('attendance').update(update as any).eq('id', this.attendanceId);
        this.attData = { ...this.attData, ...update };
      } else if (this.sharedPlan) {
        await getSupabase().from('shared_plans').update({
          fields: this.fields as any,
          plan_title: this.planTitle,
        }).eq('id', this.sharedPlan.id);
      }
    } catch {
      Utils.showToast(translate('plans.saveFailed'), 'danger');
    }
  }

  // ---- export ----

  async showExportOptions() {
    const buttons: any[] = [
      { text: 'PDF (A4)', handler: () => this.exportPdf(false) },
      { text: 'PDF (2x A5)', handler: () => this.exportPdf(true) },
      { text: translate('common.cancel'), role: 'cancel' },
    ];
    const sheet = await this.actionSheetController.create({ header: translate('planning.export'), buttons });
    await sheet.present();
  }

  async exportPdf(sideBySide = false) {
    if (!this.fields.length) { return; }
    const branding = this.brandingId !== 'none'
      ? await this.buildBranding()
      : undefined;
    await Utils.createPlanExport(
      {
        time: this.time, end: this.end, fields: this.fields, sideBySide, branding,
        dateLabel: this.planLabels.length ? `${dayjs(this.date).locale(currentLanguage()).format(`dddd, ${dateFmt()}`)} · ${this.planLabels[this.planIndex]}` : undefined,
      },
      this.planTitle || translate('plans.runSheet'),
    );
  }

  private async buildBranding() {
    const b = PUBLIC_BRANDINGS.find(x => x.id === this.brandingId);
    if (!b || b.id === 'none') { return undefined; }
    const logo = b.logoUrl ? await Utils.loadImageDataUrl(b.logoUrl) : null;
    return (logo || b.text) ? { logo: logo || undefined, text: b.text } : undefined;
  }
}
