import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import dayjs from 'dayjs';
import { FieldSelection, SharedPlan } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import {
  PUBLIC_PLANNING_TEMPLATES,
  PublicPlanningTemplate,
  PUBLIC_BRANDINGS,
  PublicBranding,
  cloneTemplateFields,
} from './public-planning-templates';
import { getSupabase } from '../services/base/supabase';
import { MyPlansComponent } from './my-plans/my-plans.component';

const STORAGE_KEY = 'attendix-public-plan';

@Component({
  selector: 'app-public-planning',
  templateUrl: './public-planning.page.html',
  styleUrls: ['./public-planning.page.scss'],
  standalone: false,
})
export class PublicPlanningPage implements OnInit {
  public templates: PublicPlanningTemplate[] = PUBLIC_PLANNING_TEMPLATES;
  public selectedTemplateId: string | null = null;
  public brandings: PublicBranding[] = PUBLIC_BRANDINGS;
  public selectedBrandingId = 'none';

  public planTitle = 'Ablaufplan';
  public date: string = dayjs().format('YYYY-MM-DD');
  public time: string = dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
  public end = '';
  public selectedFields: FieldSelection[] = [];
  public isLoggedIn = false;

  private currentPlanId: string | null = null;
  private currentEditKey: string | null = null;
  private dbSaveTimeout: any = null;

  constructor(
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private router: Router,
  ) { }

  trackByFieldId = (_: number, f: FieldSelection): string => f.id;

  async ngOnInit() {
    const { data } = await getSupabase().auth.getSession();
    this.isLoggedIn = !!data.session;

    // Redirect logged-in users from public /planung to the in-app route
    if (this.isLoggedIn && this.router.url === '/planung') {
      this.router.navigateByUrl('/tabs/settings/planung', { replaceUrl: true });
      return;
    }

    if (!this.loadFromLocalStorage()) {
      this.selectedTemplateId = this.templates[0].id;
      this.applyTemplate(this.templates[0]);
    }
    this.calculateEnd();
  }

  // ---- template handling ----
  onTemplateChange() {
    const tpl = this.templates.find(t => t.id === this.selectedTemplateId);
    if (!tpl) {return;}
    this.confirmReplace(() => this.applyTemplate(tpl));
  }

  private applyTemplate(tpl: PublicPlanningTemplate) {
    this.planTitle = tpl.name;
    if (tpl.startTime) {
      const [h, m] = tpl.startTime.split(':').map(Number);
      this.time = dayjs(this.date).hour(h).minute(m).format('YYYY-MM-DDTHH:mm');
    }
    this.selectedFields = cloneTemplateFields(tpl);
    this.calculateEnd();
  }

  private async confirmReplace(onConfirm: () => void) {
    if (!this.selectedFields.length) {
      onConfirm();
      return;
    }
    const alert = await this.alertController.create({
      header: 'Vorlage anwenden',
      message: 'Aktuellen Ablauf durch die Vorlage ersetzen?',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Ersetzen', handler: () => { onConfirm(); } },
      ],
    });
    await alert.present();
  }

  // ---- field operations ----
  calculateTime(field: FieldSelection, index: number): string {
    let minutesToAdd = 0;
    for (let i = 0; i < index; i++) {
      minutesToAdd += Number(this.selectedFields[i].time) || 0;
    }
    const t = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return `${t.add(minutesToAdd, 'minute').format('HH:mm')}${field.conductor ? ` | ${field.conductor}` : ''}`;
  }

  async addField(popover?: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [
        { type: 'textarea', name: 'field',     placeholder: 'Programmpunkt eingeben...' },
        { type: 'textarea', name: 'conductor', placeholder: 'Ausführender (optional)' },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Hinzufügen',
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = 'Bitte einen Programmpunkt eingeben.';
              return false;
            }
            this.selectedFields.push({
              id: `${evt.field}-${Date.now()}`,
              name: evt.field,
              conductor: evt.conductor ?? '',
              time: '20',
            });
            this.calculateEnd();
          }
        },
      ],
    });
    await alert.present();
  }

  async addNoteField(popover?: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: 'Notizfeld hinzufügen',
      inputs: [{ type: 'textarea', name: 'field', placeholder: 'Notiz eingeben...' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Hinzufügen',
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = 'Bitte eine Notiz eingeben.';
              return false;
            }
            this.selectedFields.push({
              id: `noteFld ${evt.field}-${Date.now()}`,
              name: evt.field,
              conductor: '',
              time: '0',
            });
            this.calculateEnd();
          }
        },
      ],
    });
    await alert.present();
  }

  async editField(field: FieldSelection, slider?: IonItemSliding) {
    slider?.close();
    const index = this.selectedFields.indexOf(field);
    const isNote = field.id.includes('noteFld');
    const inputs: any[] = isNote
      ? [{ type: 'textarea', name: 'field', value: field.name, placeholder: 'Notiz' }]
      : [
          { type: 'textarea', name: 'field',     value: field.name,      placeholder: 'Programmpunkt' },
          { type: 'textarea', name: 'conductor', value: field.conductor, placeholder: 'Ausführender' },
          { type: 'textarea', name: 'info', value: field.info, placeholder: 'Info-Text (optional)' },
        ];
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs,
      buttons: [
        {
          text: 'Löschen',
          role: 'destructive',
          cssClass: 'alert-button-danger',
          handler: () => {
            if (index !== -1) {
              this.selectedFields.splice(index, 1);
              this.calculateEnd();
            }
          },
        },
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = 'Bitte einen Programmpunkt eingeben.';
              return false;
            }
            field.name = evt.field;
            field.conductor = evt.conductor ?? '';
            field.info = evt.info?.trim() || undefined;
            this.calculateEnd();
          }
        },
      ],
    });
    await alert.present();
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.selectedFields);
    this.calculateEnd();
  }

  calculateEnd(): void {
    let t = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    for (const f of this.selectedFields) {
      t = t.add(Number(f.time) || 0, 'minutes');
    }
    this.end = t.format('YYYY-MM-DDTHH:mm');
    this.persist();
    this.schedulePersistToDb();
  }

  onDateChange() {
    const hm = dayjs(this.time).isValid() ? dayjs(this.time) : dayjs().hour(10).minute(0);
    this.time = dayjs(this.date).hour(hm.hour()).minute(hm.minute()).format('YYYY-MM-DDTHH:mm');
    this.calculateEnd();
  }

  // ---- export ----
  validate(): boolean {
    if (!this.time || !this.selectedFields.length) {
      Utils.showToast('Bitte mindestens ein Feld hinzufügen.', 'warning');
      return false;
    }
    if (!this.selectedFields.every(f => f.id.includes('noteFld') || f.time)) {
      Utils.showToast('Bitte alle Dauern ausfüllen.', 'warning');
      return false;
    }
    return true;
  }

  async export(sideBySide = false) {
    if (!this.validate()) {return;}
    const branding = await this.buildBranding();
    await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.selectedFields, sideBySide, branding },
      this.planTitle?.trim() || 'Ablaufplan',
    );
  }

  async exportImage(sideBySide = false) {
    if (!this.validate()) {return;}
    const branding = await this.buildBranding();
    const title = this.planTitle?.trim() || 'Ablaufplan';
    const blob = await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.selectedFields, sideBySide, branding, asBlob: true, asImage: true },
      title,
    );
    if (!blob) {return;}
    const dateStr = dayjs(this.date).isValid() ? dayjs(this.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    await Utils.downloadFileNative(blob, `${title}_${dateStr}${sideBySide ? '_2x' : ''}.png`);
  }

  private async buildBranding(): Promise<{ logo?: { dataUrl: string; width: number; height: number }; text?: string } | undefined> {
    const selected = this.brandings.find(b => b.id === this.selectedBrandingId);
    if (!selected || selected.id === 'none') {
      return undefined;
    }
    const logo = selected.logoUrl ? await Utils.loadImageDataUrl(selected.logoUrl) : null;
    if (!logo && !selected.text) {
      return undefined;
    }
    return { logo: logo || undefined, text: selected.text };
  }

  async showExportOptions() {
    if (!this.validate()) {return;}
    const buttons: ActionSheetButton[] = [
      { text: 'PDF (A4)',       handler: () => this.export(false) },
      { text: 'PDF (2x A5)',    handler: () => this.export(true) },
      { text: 'Bild (A4)',      handler: () => this.exportImage(false) },
      { text: 'Abbrechen',      role: 'cancel' },
    ];
    const actionSheet = await this.actionSheetController.create({
      header: 'Exportieren',
      buttons,
    });
    await actionSheet.present();
  }

  async shareCurrentPlan(editLink = false) {
    if (!this.validate()) { return; }
    const sheet = await this.actionSheetController.create({
      header: 'Link teilen',
      buttons: [
        { text: 'Nur-Lesen-Link', handler: () => this.doShare(false) },
        { text: 'Bearbeitungs-Link', handler: () => this.doShare(true) },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async doShare(editLink: boolean) {
    if (this.isLoggedIn) {
      // Logged-in: ensure stable plan row exists, then share its URL
      if (!this.currentPlanId) {
        await this.persistToDb();
      }
      if (!this.currentPlanId) {
        Utils.showToast('Fehler beim Erstellen des Links', 'danger');
        return;
      }
      const base = `https://attendix.de/plan?key=${this.currentPlanId}`;
      const url = editLink ? `${base}&edit=${this.currentEditKey}` : base;
      if (navigator.share) {
        await navigator.share({ url, title: this.planTitle?.trim() || 'Ablaufplan' });
      } else {
        await navigator.clipboard.writeText(url);
        Utils.showToast('Link in Zwischenablage kopiert', 'success');
      }
      return;
    }

    // Anon: one-off insert, no creator
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const editKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const { error } = await getSupabase().from('shared_plans').insert({
      id,
      edit_key: editKey,
      plan_title: this.planTitle?.trim() || 'Ablaufplan',
      date: this.date,
      time: this.time,
      end_time: this.end,
      fields: this.selectedFields as any,
      branding_id: this.selectedBrandingId !== 'none' ? this.selectedBrandingId : null,
    } as any);

    if (error) {
      Utils.showToast('Fehler beim Erstellen des Links', 'danger');
      return;
    }

    const base = `https://attendix.de/plan?key=${id}`;
    const url = editLink ? `${base}&edit=${editKey}` : base;
    if (navigator.share) {
      await navigator.share({ url, title: this.planTitle?.trim() || 'Ablaufplan' });
    } else {
      await navigator.clipboard.writeText(url);
      Utils.showToast('Link in Zwischenablage kopiert', 'success');
    }
  }

  async openMyPlans() {
    const modal = await this.modalController.create({
      component: MyPlansComponent,
      breakpoints: [0, 0.5, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'load' && data?.plan) {
      this.loadPlan(data.plan as SharedPlan);
    }
  }

  private loadPlan(plan: SharedPlan) {
    this.currentPlanId = plan.id;
    this.currentEditKey = plan.edit_key;
    this.planTitle = plan.plan_title || 'Ablaufplan';
    this.date = plan.date || dayjs().format('YYYY-MM-DD');
    this.time = plan.time || dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
    this.end = plan.end_time || '';
    this.selectedFields = (plan.fields as unknown as FieldSelection[]) || [];
    this.selectedBrandingId = plan.branding_id || 'none';
    this.persist();
  }

  async newPlan() {
    if (this.selectedFields.length) {
      const alert = await this.alertController.create({
        header: 'Neuer Plan',
        message: 'Aktuellen Plan verwerfen und einen neuen erstellen?',
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'Neuer Plan', handler: () => this.resetToNew() },
        ],
      });
      await alert.present();
    } else {
      this.resetToNew();
    }
  }

  private resetToNew() {
    this.currentPlanId = null;
    this.currentEditKey = null;
    this.planTitle = 'Ablaufplan';
    this.date = dayjs().format('YYYY-MM-DD');
    this.time = dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
    this.end = '';
    this.selectedFields = [];
    this.selectedTemplateId = null;
    this.selectedBrandingId = 'none';
    this.persist();
  }

  // ---- DB persistence (logged-in only) ----

  private schedulePersistToDb() {
    if (!this.isLoggedIn) { return; }
    if (this.dbSaveTimeout) { clearTimeout(this.dbSaveTimeout); }
    this.dbSaveTimeout = setTimeout(() => this.persistToDb(), 500);
  }

  private async persistToDb() {
    if (!this.isLoggedIn) { return; }
    const { data: sessionData } = await getSupabase().auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { return; }

    if (!this.currentPlanId) {
      this.currentPlanId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      this.currentEditKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      this.persist();
    }

    await getSupabase().from('shared_plans').upsert({
      id: this.currentPlanId,
      edit_key: this.currentEditKey!,
      plan_title: this.planTitle?.trim() || 'Ablaufplan',
      date: this.date,
      time: this.time,
      end_time: this.end,
      fields: this.selectedFields as any,
      branding_id: this.selectedBrandingId !== 'none' ? this.selectedBrandingId : null,
      creator_user_id: userId,
    } as any, { onConflict: 'id' });
  }

  async resetToTemplate() {
    const tpl = this.templates.find(t => t.id === this.selectedTemplateId);
    if (!tpl) {
      Utils.showToast('Keine Vorlage ausgewählt.', 'warning');
      return;
    }
    const alert = await this.alertController.create({
      header: 'Vorlage wiederherstellen',
      message: `Alle Änderungen verwerfen und die Standardwerte der Vorlage „${tpl.name}“ wiederherstellen?`,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Wiederherstellen',
          handler: () => {
            this.applyTemplate(tpl);
          }
        },
      ],
    });
    await alert.present();
  }

  // ---- localStorage backup ----
  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        planTitle: this.planTitle,
        date: this.date,
        time: this.time,
        end: this.end,
        selectedTemplateId: this.selectedTemplateId,
        selectedBrandingId: this.selectedBrandingId,
        selectedFields: this.selectedFields,
        currentPlanId: this.currentPlanId,
        currentEditKey: this.currentEditKey,
      }));
    } catch {
      // Safari Private Mode / Quota: ignorieren
    }
  }

  private loadFromLocalStorage(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {return false;}
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.selectedFields)) {return false;}
      this.planTitle = s.planTitle ?? 'Ablaufplan';
      this.date = s.date ?? this.date;
      this.time = s.time ?? this.time;
      this.end = s.end ?? '';
      this.selectedTemplateId = s.selectedTemplateId ?? null;
      this.selectedBrandingId = s.selectedBrandingId ?? 'none';
      this.selectedFields = s.selectedFields;
      this.currentPlanId = s.currentPlanId ?? null;
      this.currentEditKey = s.currentEditKey ?? null;
      return true;
    } catch {
      return false;
    }
  }
}
