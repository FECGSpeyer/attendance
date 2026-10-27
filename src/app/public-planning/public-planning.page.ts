import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { FieldSelection, History, Plan, SharedPlan, Song } from '../utilities/interfaces';
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
import { DbService } from '../services/db.service';
import { translate } from '@jsverse/transloco';

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

  public planTitle = translate('plans.runSheet');
  public date: string = dayjs().format('YYYY-MM-DD');
  public time: string = dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
  public end = '';
  public selectedFields: FieldSelection[] = [];
  public isLoggedIn = false;
  public hasOrg = false;
  public isOrgPlan = false;
  public fromOrgPlans = false;
  public orgPlansBackHref = '/tabs/settings';
  public isGeneral = false;
  public songs: Song[] = [];
  public filteredSongs: Song[] = [];
  public history: History[] = [];
  public isSongSelectorOpen = false;
  public songSearchTerm = '';

  private currentPlanId: string | null = null;
  private currentEditKey: string | null = null;
  private dbSaveTimeout: any = null;

  constructor(
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private router: Router,
    public db: DbService,
  ) { }

  trackByFieldId = (_: number, f: FieldSelection): string => f.id;

  async ngOnInit() {
    const { data } = await getSupabase().auth.getSession();
    this.isLoggedIn = !!data.session;
    this.hasOrg = this.isLoggedIn && !!this.db.organisation?.();
    this.fromOrgPlans = this.router.url.includes('org-plans/planung');
    const isTabOrgPlans = this.router.url.startsWith('/tabs/org-plans');
    if (this.fromOrgPlans) {
      this.orgPlansBackHref = isTabOrgPlans ? '/tabs/org-plans' : '/tabs/settings/org-plans';
    }

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

    if (this.isLoggedIn) {
      this.isGeneral = this.db.tenant().type === 'general';
      this.songs = await this.db.getSongs();
      this.filteredSongs = [...this.songs];
      this.history = await this.db.getUpcomingHistory();
      // Re-resolve any placeholder fields that were applied before songs/history loaded
      this.selectedFields = this.resolvePublicTemplateFields(this.selectedFields);
      this.calculateEnd();
    }
  }

  // ---- template handling ----
  onTemplateChange() {
    if (this.selectedTemplateId?.startsWith('org:')) {
      const idx = Number(this.selectedTemplateId.slice(4));
      const tpl = this.orgTemplates[idx];
      if (!tpl) { return; }
      this.confirmReplace(() => {
        this.selectedFields = this.resolvePlaceholderFields(tpl.fields);
        if (tpl.title) { this.planTitle = tpl.title; }
        if (tpl.time) {
          const base = dayjs(tpl.time).isValid() ? dayjs(tpl.time) : null;
          if (base) { this.time = dayjs(this.date).hour(base.hour()).minute(base.minute()).format('YYYY-MM-DDTHH:mm'); }
        }
        this.calculateEnd();
      });
      return;
    }
    const tpl = this.templates.find(t => t.id === this.selectedTemplateId);
    if (!tpl) { return; }
    this.confirmReplace(() => this.applyTemplate(tpl));
  }

  private applyTemplate(tpl: PublicPlanningTemplate) {
    this.planTitle = tpl.name;
    if (tpl.startTime) {
      const [h, m] = tpl.startTime.split(':').map(Number);
      this.time = dayjs(this.date).hour(h).minute(m).format('YYYY-MM-DDTHH:mm');
    }
    this.selectedFields = this.resolvePublicTemplateFields(cloneTemplateFields(tpl));
    this.calculateEnd();
  }

  private resolvePublicTemplateFields(fields: FieldSelection[]): FieldSelection[] {
    const PLACEHOLDER = /^(Chor\/Orchester|Werk\s+\d+)/i;
    const songsAdded = new Set<string>();
    return fields.map(field => {
      if (!PLACEHOLDER.test(field.name)) { return field; }
      const his = this.history.find(h => !songsAdded.has(String(h.songId)));
      if (!his) { return field; }
      songsAdded.add(String(his.songId));
      const song: Song = this.songs.find(s => s.id === his.songId);
      if (!song) { return field; }
      return {
        ...field,
        id: String(song.id),
        name: `${song.number}. ${song.name}`,
        conductor: his.conductorName || field.conductor || '',
        songId: song.id,
      };
    });
  }

  get orgTemplates(): Plan[] {
    return this.db.organisation?.()?.planning_templates ?? [];
  }

  get orgDefaultFields(): FieldSelection[] {
    return this.db.organisation?.()?.default_fields ?? [];
  }

  addOrgField(field: FieldSelection, popover: IonPopover) {
    popover.dismiss();
    this.selectedFields.push({ ...field });
    this.calculateEnd();
  }

  // ---- song operations ----
  private resolvePlaceholderFields(fields: FieldSelection[]): FieldSelection[] {
    const songsAdded = new Set<string>();
    const result: FieldSelection[] = [];
    for (const field of fields) {
      if (field.id?.startsWith('song-placeholder-')) {
        const his = this.history.find(h => !songsAdded.has(String(h.songId)));
        if (his) {
          songsAdded.add(String(his.songId));
          const song: Song = this.songs.find(s => s.id === his.songId);
          if (song) {
            result.push({
              ...field,
              id: String(song.id),
              name: `${song.number}. ${song.name}`,
              conductor: his.conductorName || '',
              songId: song.id,
            });
          }
        }
        continue;
      }
      result.push({ ...field });
    }
    return result;
  }

  addCurrentSongs(popover: IonPopover) {
    popover.dismiss();
    for (const his of this.history) {
      if (!this.selectedFields.find(f => Number(f.id) === his.songId)) {
        const song: Song = this.songs.find(s => s.id === his.songId);
        if (!song) { continue; }
        this.selectedFields.push({
          id: String(song.id),
          name: `${song.number}. ${song.name}`,
          time: '20',
          conductor: his.conductorName || '',
          songId: song.id,
        });
      }
    }
    this.calculateEnd();
  }

  openSongSelector(popover: IonPopover) {
    popover.dismiss();
    this.isSongSelectorOpen = true;
  }

  closeSongSelector() {
    this.isSongSelectorOpen = false;
  }

  selectSong(songId: number) {
    const song: Song = this.songs.find(s => s.id === songId);
    if (!song) { return; }
    const conductor = this.history?.find(h => h.songId === song.id)?.conductorName;
    this.selectedFields.push({
      id: String(song.id),
      name: `${song.number}. ${song.name}`,
      time: '20',
      conductor: conductor || '',
      songId: song.id,
    });
    this.calculateEnd();
    this.isSongSelectorOpen = false;
  }

  onSongSearch(event: any) {
    const term = event.target.value?.toLowerCase() ?? '';
    this.songSearchTerm = term;
    if (!term) { this.filteredSongs = [...this.songs]; return; }
    this.filteredSongs = this.songs.filter(s =>
      s.name?.toLowerCase().includes(term) || String(s.number).includes(term) || s.composer?.toLowerCase().includes(term)
    );
  }

  resetSongSearch() {
    this.songSearchTerm = '';
    this.filteredSongs = [...this.songs];
  }

  private async confirmReplace(onConfirm: () => void) {
    if (!this.selectedFields.length) {
      onConfirm();
      return;
    }
    const alert = await this.alertController.create({
      header: translate('plans.applyTemplate'),
      message: translate('plans.replaceWithTemplate'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('person.replace'), handler: () => { onConfirm(); } },
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
      header: translate('planning.addField'),
      inputs: [
        { type: 'textarea', name: 'field',     placeholder: translate('planning.enterItem') },
        { type: 'textarea', name: 'conductor', placeholder: translate('plans.performerOptional') },
        { type: 'textarea', name: 'info',      placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = translate('planning.enterItemPlease');
              return false;
            }
            this.selectedFields.push({
              id: `${evt.field}-${Date.now()}`,
              name: evt.field,
              conductor: evt.conductor ?? '',
              info: evt.info?.trim() || undefined,
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
      header: translate('planning.addNoteField'),
      inputs: [{ type: 'textarea', name: 'field', placeholder: translate('planning.enterNote') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = translate('plans.enterNotePlease');
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
      ? [{ type: 'textarea', name: 'field', value: field.name, placeholder: translate('planning.note') }]
      : [
          { type: 'textarea', name: 'field',     value: field.name,      placeholder: translate('planning.item') },
          { type: 'textarea', name: 'conductor', value: field.conductor, placeholder: translate('planning.performer') },
          { type: 'textarea', name: 'info', value: field.info, placeholder: translate('planning.infoOptional') },
        ];
    const alert = await this.alertController.create({
      header: translate('planning.editField'),
      inputs,
      buttons: [
        {
          text: translate('common.delete'),
          role: 'destructive',
          cssClass: 'alert-button-danger',
          handler: () => {
            if (index !== -1) {
              this.selectedFields.splice(index, 1);
              this.calculateEnd();
            }
          },
        },
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = translate('planning.enterItemPlease');
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
      Utils.showToast(translate('plans.addFieldMin'), 'warning');
      return false;
    }
    if (!this.selectedFields.every(f => f.id.includes('noteFld') || f.time)) {
      Utils.showToast(translate('plans.fillDurations'), 'warning');
      return false;
    }
    return true;
  }

  async export(sideBySide = false) {
    if (!this.validate()) {return;}
    const branding = await this.buildBranding();
    await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.selectedFields, sideBySide, branding },
      this.planTitle?.trim() || translate('plans.runSheet'),
    );
  }

  async exportImage(sideBySide = false) {
    if (!this.validate()) {return;}
    const branding = await this.buildBranding();
    const title = this.planTitle?.trim() || translate('plans.runSheet');
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
      { text: translate('plans.imageA4'),      handler: () => this.exportImage(false) },
      { text: translate('common.cancel'),      role: 'cancel' },
    ];
    const actionSheet = await this.actionSheetController.create({
      header: translate('planning.export'),
      buttons,
    });
    await actionSheet.present();
  }

  async shareCurrentPlan(editLink = false) {
    if (!this.validate()) { return; }
    const sheet = await this.actionSheetController.create({
      header: translate('plans.shareExport'),
      buttons: [
        { text: translate('planning.readOnlyLink'), handler: () => this.doShare(false) },
        { text: translate('planning.editLink'), handler: () => this.doShare(true) },
        { text: 'PDF (A4)',       handler: () => this.export(false) },
        { text: 'PDF (2x A5)',    handler: () => this.export(true) },
        { text: translate('plans.imageA4'),      handler: () => this.exportImage(false) },
        { text: translate('common.cancel'), role: 'cancel' },
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
        Utils.showToast(translate('plans.linkFailed'), 'danger');
        return;
      }
      const base = `https://attendix.de/plan?key=${this.currentPlanId}`;
      const url = editLink ? `${base}&edit=${this.currentEditKey}` : base;
      if (navigator.share) {
        await navigator.share({ url, title: this.planTitle?.trim() || translate('plans.runSheet') });
      } else {
        await navigator.clipboard.writeText(url);
        Utils.showToast(translate('planning.linkCopied'), 'success');
      }
      return;
    }

    // Anon: one-off insert, no creator
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const editKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const { error } = await getSupabase().from('shared_plans').insert({
      id,
      edit_key: editKey,
      plan_title: this.planTitle?.trim() || translate('plans.runSheet'),
      date: this.date,
      time: this.time,
      end_time: this.end,
      fields: this.selectedFields as any,
      branding_id: this.selectedBrandingId !== 'none' ? this.selectedBrandingId : null,
    } as any);

    if (error) {
      Utils.showToast(translate('plans.linkFailed'), 'danger');
      return;
    }

    const base = `https://attendix.de/plan?key=${id}`;
    const url = editLink ? `${base}&edit=${editKey}` : base;
    if (navigator.share) {
      await navigator.share({ url, title: this.planTitle?.trim() || translate('plans.runSheet') });
    } else {
      await navigator.clipboard.writeText(url);
      Utils.showToast(translate('planning.linkCopied'), 'success');
    }
  }

  async openMyPlans() {
    const modal = await this.modalController.create({
      component: MyPlansComponent,
      breakpoints: [0, 0.5, 0.9],
      initialBreakpoint: 0.9,
      handleBehavior: 'none',
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
    this.planTitle = plan.plan_title || translate('plans.runSheet');
    this.date = plan.date || dayjs().format('YYYY-MM-DD');
    this.time = plan.time || dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
    this.end = plan.end_time || '';
    this.selectedFields = (plan.fields as unknown as FieldSelection[]) || [];
    this.selectedBrandingId = plan.branding_id || 'none';
    this.isOrgPlan = !!(plan as any).org_id;
    this.persist();
  }

  async newPlan() {
    if (this.selectedFields.length) {
      const alert = await this.alertController.create({
        header: translate('plans.newPlan'),
        message: translate('plans.discardNew'),
        buttons: [
          { text: translate('common.cancel'), role: 'cancel' },
          { text: translate('plans.newPlan'), handler: () => this.resetToNew() },
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
    this.planTitle = translate('plans.runSheet');
    this.date = dayjs().format('YYYY-MM-DD');
    this.time = dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
    this.end = '';
    this.selectedFields = [];
    this.selectedTemplateId = null;
    this.selectedBrandingId = 'none';
    this.isOrgPlan = false;
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
      plan_title: this.planTitle?.trim() || translate('plans.runSheet'),
      date: this.date,
      time: this.time,
      end_time: this.end,
      fields: this.selectedFields as any,
      branding_id: this.selectedBrandingId !== 'none' ? this.selectedBrandingId : null,
      creator_user_id: userId,
    } as any, { onConflict: 'id' });
  }

  async addToOrg() {
    const org = this.db.organisation?.();
    if (!org?.id) { return; }
    if (!this.validate()) { return; }

    await this.persistToDb();
    if (!this.currentPlanId) {
      Utils.showToast(translate('plans.savePlanFailed'), 'danger');
      return;
    }

    const { error } = await getSupabase()
      .from('shared_plans')
      .update({ org_id: org.id } as any)
      .eq('id', this.currentPlanId);

    if (error) {
      Utils.showToast(translate('plans.addOrgFailed'), 'danger');
      return;
    }

    this.isOrgPlan = true;
    Utils.showToast(translate('plans.addedToOrg', { org: org.name }), 'success');
  }

  async removeFromOrg() {
    if (!this.currentPlanId) { return; }

    const { error } = await getSupabase()
      .from('shared_plans')
      .update({ org_id: null } as any)
      .eq('id', this.currentPlanId);

    if (error) {
      Utils.showToast(translate('plans.removeOrgFailed'), 'danger');
      return;
    }

    this.isOrgPlan = false;
    Utils.showToast(translate('plans.removedFromOrg'), 'success');
  }

  async resetToTemplate() {
    const tpl = this.templates.find(t => t.id === this.selectedTemplateId);
    if (!tpl) {
      Utils.showToast(translate('plans.noTemplate'), 'warning');
      return;
    }
    const alert = await this.alertController.create({
      header: translate('plans.restoreTemplate'),
      message: translate('plans.restoreTemplateMessage', { name: tpl.name }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('plans.restore'),
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
      this.planTitle = s.planTitle ?? translate('plans.runSheet');
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
