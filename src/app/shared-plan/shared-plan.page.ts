import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { AlertController, ActionSheetController } from '@ionic/angular';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { FieldSelection, SharedPlan } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { PUBLIC_BRANDINGS } from '../public-planning/public-planning-templates';
import { getSupabase } from '../services/base/supabase';

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
      .select('id, date, plan, type_id, typeInfo, share_key, share_edit_key')
      .eq('id', id)
      .eq('share_key', key)
      .single();

    if (!data || !data.plan) {
      this.notFound = true;
      return;
    }

    this.attendanceId = data.id;
    this.attendanceDate = data.date;
    const plan: any = data.plan;
    this.planTitle = plan.title || (data as any).typeInfo || '';
    this.date = data.date;
    this.time = plan.time || '';
    this.end = plan.end || '';
    this.fields = plan.fields || [];

    if (editKey && editKey === (data as any).share_edit_key) {
      this.isEditMode = true;
      this.subscribeAttendanceRealtime(id);
    }
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
    this.planTitle = data.plan_title || 'Ablaufplan';
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
          if (plan) {
            this.time = plan.time || this.time;
            this.end = plan.end || this.end;
            this.fields = plan.fields || this.fields;
            this.planTitle = plan.title || this.planTitle;
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
    return dayjs(this.date).locale('de').format('dddd, DD.MM.YYYY');
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
      this.liveInterval = setInterval(() => this.updateActiveIndex(), 30000);
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

  private scrollToActive() {
    setTimeout(() => {
      document.querySelector('.active-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  // ---- edit mode ----

  async editTitle() {
    if (!this.isEditMode) { return; }
    const alert = await this.alertController.create({
      header: 'Titel bearbeiten',
      inputs: [{ type: 'text', name: 'title', value: this.planTitle, placeholder: 'Titel' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
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

  async addNote() {
    if (!this.isEditMode) { return; }
    const alert = await this.alertController.create({
      header: 'Notiz hinzufügen',
      inputs: [{ type: 'textarea', name: 'text', placeholder: 'Notiz eingeben...' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Hinzufügen',
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

  removeField(index: number) {
    if (!this.isEditMode) { return; }
    this.fields.splice(index, 1);
    this.saveEdits();
  }

  async editField(field: FieldSelection) {
    if (!this.isEditMode) { return; }
    const isNote = field.id.includes('noteFld');
    const inputs: any[] = isNote
      ? [{ type: 'textarea', name: 'field', value: field.name, placeholder: 'Notiz' }]
      : [
          { type: 'textarea', name: 'field', value: field.name, placeholder: 'Programmpunkt' },
          { type: 'textarea', name: 'conductor', value: field.conductor, placeholder: 'Ausführender' },
          { type: 'textarea', name: 'info', value: field.info, placeholder: 'Info-Text (optional)' },
        ];
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
          handler: (evt: any) => {
            if (!evt.field) { return false; }
            field.name = evt.field;
            if (!isNote) {
              field.conductor = evt.conductor ?? '';
              field.info = evt.info?.trim() || undefined;
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
        await getSupabase().from('attendance').update({
          plan: { time: this.time, end: this.end, fields: this.fields, title: this.planTitle || undefined }
        } as any).eq('id', this.attendanceId);
      } else if (this.sharedPlan) {
        await getSupabase().from('shared_plans').update({
          fields: this.fields as any,
          plan_title: this.planTitle,
        }).eq('id', this.sharedPlan.id);
      }
    } catch {
      Utils.showToast('Fehler beim Speichern', 'danger');
    }
  }

  // ---- export ----

  async showExportOptions() {
    const buttons: any[] = [
      { text: 'PDF (A4)', handler: () => this.exportPdf(false) },
      { text: 'PDF (2x A5)', handler: () => this.exportPdf(true) },
      { text: 'Abbrechen', role: 'cancel' },
    ];
    const sheet = await this.actionSheetController.create({ header: 'Exportieren', buttons });
    await sheet.present();
  }

  async exportPdf(sideBySide = false) {
    if (!this.fields.length) { return; }
    const branding = this.brandingId !== 'none'
      ? await this.buildBranding()
      : undefined;
    await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.fields, sideBySide, branding },
      this.planTitle || 'Ablaufplan',
    );
  }

  private async buildBranding() {
    const b = PUBLIC_BRANDINGS.find(x => x.id === this.brandingId);
    if (!b || b.id === 'none') { return undefined; }
    const logo = b.logoUrl ? await Utils.loadImageDataUrl(b.logoUrl) : null;
    return (logo || b.text) ? { logo: logo || undefined, text: b.text } : undefined;
  }
}
