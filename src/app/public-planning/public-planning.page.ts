import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { FieldSelection, History, Plan, PlanBlockTemplate, SharedPlan, Song } from '../utilities/interfaces';
import { childrenOf, cloneBlock, groupDuration, isGroupHead, lastIndexOfGroup, moveRow, newGroupHead, normalizeGroups } from '../utilities/plan-groups';
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

interface PlanRow {
  key: string;
  field?: FieldSelection;
  /** Index of `field` in selectedFields. */
  index: number;
  /** Set on the add row of a block. */
  addFor?: FieldSelection;
}

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

  /** Programmblöcke folded in the editor (UI state only). */
  private collapsedGroups = new Set<string>();
  private rowsCache: PlanRow[] = [];
  private rowsKey = '';

  constructor(
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private router: Router,
    public db: DbService,
  ) { }

  /** Rows shown in the editor; Unterpunkte of folded blocks are hidden. Cached for stable change detection. */
  get rows(): PlanRow[] {
    const fields = this.selectedFields;
    const key = fields.map(f => `${f.id}|${f.groupId ?? ''}|${f.isGroup ? 1 : 0}`).join(';') + '#' + [...this.collapsedGroups].join(';');
    if (key === this.rowsKey && this.rowsCache.length) { return this.rowsCache; }
    const rows: PlanRow[] = [];
    const seen = new Map<string, number>();
    const rowKey = (id: string) => {
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return n > 1 ? `${id}#${n}` : id;
    };
    fields.forEach((field, index) => {
      if (field.groupId && this.collapsedGroups.has(field.groupId)) { return; }
      rows.push({ key: rowKey(field.id), field, index });
      const closesBlock = isGroupHead(field) ? !fields[index + 1]?.groupId : (!!field.groupId && fields[index + 1]?.groupId !== field.groupId);
      const head = isGroupHead(field) ? field : fields.find(f => f.id === field.groupId);
      if (closesBlock && head && !this.collapsedGroups.has(head.id)) {
        rows.push({ key: `add-${head.id}`, index: -1, addFor: head });
      }
    });
    this.rowsKey = key;
    this.rowsCache = rows;
    return rows;
  }

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

  get blockTemplates(): PlanBlockTemplate[] {
    return this.isLoggedIn ? (this.db.tenant?.()?.plan_block_templates ?? []) : [];
  }

  templateMinutes(tpl: PlanBlockTemplate): number {
    const head = tpl.fields.find(isGroupHead);
    return head ? groupDuration(tpl.fields, head.id) : 0;
  }

  insertBlockTemplate(template: PlanBlockTemplate, popover: IonPopover) {
    popover?.dismiss();
    this.selectedFields.push(...cloneBlock(template.fields));
    this.calculateEnd();
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
    return `${this.startOf(index).format('HH:mm')}${field.conductor ? ` | ${field.conductor}` : ''}`;
  }

  private startOf(index: number): dayjs.Dayjs {
    let minutesToAdd = 0;
    for (let i = 0; i < index; i++) {
      minutesToAdd += Number(this.selectedFields[i].time) || 0;
    }
    const t = dayjs(this.time).isValid()
      ? dayjs(this.time)
      : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return t.add(minutesToAdd, 'minute');
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
              this.removeField(index);
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
    const { from, to } = ev.detail;
    // The list is rebuilt from selectedFields, so Ionic must not move the DOM itself.
    ev.detail.complete(false);

    const rows = [...this.rows];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    if (!moved?.field) { return; }

    // Dropped right above a block's add row: it belongs into that block; right below it: it doesn't.
    const pos = rows.indexOf(moved);
    let join: string | null | undefined;
    if (!isGroupHead(moved.field)) {
      if (rows[pos + 1]?.addFor) { join = rows[pos + 1].addFor.id; }
      else if (rows[pos - 1]?.addFor) { join = null; }
    }

    const fieldRows = this.rows.filter(r => r.field);
    const visible = fieldRows.map(r => r.index);
    const fromField = fieldRows.indexOf(moved);
    const toField = rows.filter(r => r.field).indexOf(moved);
    this.selectedFields = moveRow(this.selectedFields, visible, fromField, toField, join);
    this.calculateEnd();
  }

  removeField(index: number, slider?: IonItemSliding) {
    slider?.close();
    const field = this.selectedFields[index];
    if (isGroupHead(field)) {
      void this.confirmDeleteGroup(field);
      return;
    }
    this.selectedFields.splice(index, 1);
    this.calculateEnd();
  }

  // ---- Programmblöcke (see plan-groups.ts) ----

  isCollapsed(head: FieldSelection): boolean {
    return this.collapsedGroups.has(head.id);
  }

  toggleGroup(head: FieldSelection) {
    if (this.collapsedGroups.has(head.id)) {
      this.collapsedGroups.delete(head.id);
    } else {
      this.collapsedGroups.add(head.id);
    }
  }

  groupMinutes(head: FieldSelection): number {
    return groupDuration(this.selectedFields, head.id);
  }

  /** "10:37 – 10:55" for a block head. */
  groupRange(head: FieldSelection, index: number): string {
    const start = this.startOf(index);
    return `${start.format('HH:mm')} – ${start.add(this.groupMinutes(head), 'minute').format('HH:mm')}`;
  }

  /** Indenting needs a block right above; any Unterpunkt can be moved out. */
  canIndent(index: number): boolean {
    const field = this.selectedFields[index];
    if (!field || isGroupHead(field)) { return false; }
    if (field.groupId) { return true; }
    const prev = this.selectedFields[index - 1];
    return !!prev && (isGroupHead(prev) || !!prev.groupId);
  }

  toggleIndent(index: number, slider: IonItemSliding) {
    slider.close();
    const field = this.selectedFields[index];
    if (field.groupId) {
      // Move it out below the block.
      const groupId = field.groupId;
      this.selectedFields.splice(index, 1);
      delete field.groupId;
      this.selectedFields.splice(lastIndexOfGroup(this.selectedFields, groupId) + 1, 0, field);
    } else {
      const prev = this.selectedFields[index - 1];
      field.groupId = isGroupHead(prev) ? prev.id : prev.groupId;
      this.collapsedGroups.delete(field.groupId);
    }
    this.calculateEnd();
  }

  async addGroup(popover?: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: translate('planning.addBlock'),
      message: translate('planning.blockDurationHint'),
      inputs: [
        { type: 'textarea', name: 'field', placeholder: translate('planning.blockNamePlaceholder') },
        { type: 'textarea', name: 'conductor', placeholder: translate('planning.performanceOptional') },
        { type: 'textarea', name: 'info', placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('common.create'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterNamePlease');
              return false;
            }
            const head = newGroupHead(evt.field.trim(), evt.conductor?.trim(), evt.info?.trim());
            this.selectedFields.push(head);
            this.calculateEnd();
            void this.addSubItem(head);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async addSubItem(head: FieldSelection) {
    const alert = await this.alertController.create({
      header: translate('planning.addSubItem'),
      subHeader: head.name,
      inputs: [
        { type: 'textarea', name: 'field', placeholder: translate('planning.subItemPlaceholder') },
        { type: 'textarea', name: 'conductor', placeholder: translate('planning.enterPerformer') },
        { type: 'textarea', name: 'info', placeholder: translate('planning.subItemInfoPlaceholder') },
        { type: 'number', label: translate('planning.minutes'), name: 'time', value: 5, placeholder: translate('planning.minutes') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterItemPlease');
              return false;
            }
            const at = lastIndexOfGroup(this.selectedFields, head.id) + 1;
            this.selectedFields.splice(at, 0, {
              id: `fld-${crypto.randomUUID()}`,
              name: evt.field.trim(),
              conductor: evt.conductor ?? '',
              info: evt.info?.trim() || undefined,
              time: evt.time ? String(evt.time) : '5',
              groupId: head.id,
            });
            this.collapsedGroups.delete(head.id);
            this.calculateEnd();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async showGroupOptions(head: FieldSelection) {
    const sheet = await this.actionSheetController.create({
      header: head.name,
      subHeader: translate('planning.blockSubHeader', { count: childrenOf(this.selectedFields, head.id).length, min: this.groupMinutes(head) }),
      buttons: [
        { text: translate('planning.editBlock'), handler: () => { void this.editGroup(head); } },
        { text: translate('planning.addSubItem'), handler: () => { void this.addSubItem(head); } },
        { text: translate('planning.dissolveBlock'), handler: () => { this.dissolveGroup(head); } },
        { text: translate('planning.deleteBlockWithItems'), role: 'destructive', handler: () => { void this.confirmDeleteGroup(head); } },
        { text: translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async editGroup(head: FieldSelection) {
    const alert = await this.alertController.create({
      header: translate('planning.editBlock'),
      inputs: [
        { type: 'textarea', label: translate('planning.name'), name: 'field', value: head.name, placeholder: translate('planning.name') },
        { type: 'textarea', label: translate('planning.performance'), name: 'conductor', value: head.conductor, placeholder: translate('planning.performanceOptional') },
        { type: 'textarea', label: translate('planning.info'), name: 'info', value: head.info, placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterNamePlease');
              return false;
            }
            head.name = evt.field.trim();
            head.conductor = evt.conductor ?? '';
            head.info = evt.info?.trim() || undefined;
            this.calculateEnd();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Removes the head; its Unterpunkte stay as normal fields. */
  dissolveGroup(head: FieldSelection) {
    this.selectedFields = this.selectedFields
      .filter(f => f.id !== head.id)
      .map(f => {
        if (f.groupId === head.id) { delete f.groupId; }
        return f;
      });
    this.collapsedGroups.delete(head.id);
    this.calculateEnd();
  }

  private async confirmDeleteGroup(head: FieldSelection) {
    const count = childrenOf(this.selectedFields, head.id).length;
    if (!count) {
      this.selectedFields = this.selectedFields.filter(f => f.id !== head.id);
      this.calculateEnd();
      return;
    }
    const alert = await this.alertController.create({
      header: translate('planning.deleteBlockConfirm'),
      message: translate('planning.blockHasItems', { name: head.name, count }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('planning.onlyDissolve'), handler: () => { this.dissolveGroup(head); } },
        {
          text: translate('planning.deleteAll'),
          role: 'destructive',
          handler: () => {
            this.selectedFields = this.selectedFields.filter(f => f.id !== head.id && f.groupId !== head.id);
            this.calculateEnd();
          },
        },
      ],
    });
    await alert.present();
  }

  calculateEnd(): void {
    normalizeGroups(this.selectedFields);
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

  /** Signed-in users with a linked Telegram chat can send the plan there, like in the Termin planner. */
  get hasChatId(): boolean {
    return this.isLoggedIn && Boolean(this.db.tenantUser?.()?.telegram_chat_id);
  }

  private telegramButtons(): ActionSheetButton[] {
    if (!this.hasChatId) { return []; }
    return [
      { text: translate('attendance.telegramPdf'),   handler: () => this.send(false) },
      { text: translate('attendance.telegramPdfA5'), handler: () => this.send(false, true) },
      { text: translate('attendance.telegramImage'), handler: () => this.send(true) },
    ];
  }

  async send(asImage = false, sideBySide = false) {
    if (!this.validate()) { return; }
    const branding = await this.buildBranding();
    const title = this.planTitle?.trim() || translate('plans.runSheet');
    const blob = await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.selectedFields, sideBySide, branding, asBlob: true, asImage },
      title,
    );
    if (!blob) { return; }
    const dateStr = dayjs(this.date).isValid() ? dayjs(this.date).format('DD_MM_YYYY') : dayjs().format('DD_MM_YYYY');
    await this.db.sendPlanPerTelegram(blob, `${title.replace('(', '').replace(')', '')}_${dateStr}${sideBySide ? '_2x' : ''}`, asImage);
  }

  async showExportOptions() {
    if (!this.validate()) {return;}
    const buttons: ActionSheetButton[] = [
      { text: 'PDF (A4)',       handler: () => this.export(false) },
      { text: 'PDF (2x A5)',    handler: () => this.export(true) },
      { text: translate('plans.imageA4'),      handler: () => this.exportImage(false) },
      ...this.telegramButtons(),
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
        ...this.telegramButtons(),
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
