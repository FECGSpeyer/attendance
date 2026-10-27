import { Component, OnInit } from '@angular/core';
import { AlertController, AlertInput, IonItemSliding, IonPopover, ItemReorderEventDetail } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { FieldSelection, Plan } from 'src/app/utilities/interfaces';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-org-planning-templates',
  templateUrl: './org-planning-templates.page.html',
  styleUrls: [],
  standalone: false,
})
export class OrgPlanningTemplatesPage implements OnInit {
  public templates: Plan[] = [];
  public defaultFields: FieldSelection[] = [];
  public selectedTemplateIndex: number | null = null;
  public isGeneral = false;
  public templateEnds: string[] = [];

  constructor(
    public db: DbService,
    private alertController: AlertController,
  ) {}

  ngOnInit() {
    const org = this.db.organisation();
    this.templates = JSON.parse(JSON.stringify(org?.planning_templates ?? []));
    this.defaultFields = JSON.parse(JSON.stringify(org?.default_fields ?? []));
    this.isGeneral = this.db.tenant().type === 'general';
    this.templateEnds = this.templates.map(t => this.computeEnd(t));
  }

  // ── Default Fields ─────────────────────────────────────────────────────────

  async addDefaultField() {
    const alert = await this.alertController.create({
      header: translate('typeSettings.addField'),
      inputs: [{
        type: 'textarea',
        name: 'name',
        placeholder: translate('orgTemplates.fieldNamePh'),
      }, {
        type: 'textarea',
        name: 'conductor',
        placeholder: translate('orgTemplates.performerOptPh'),
      }, {
        type: 'textarea',
        name: 'info',
        placeholder: translate('typeSettings.infoOptional'),
      }, {
        type: 'number',
        label: translate('orgTemplates.minutes'),
        name: 'time',
        value: 20,
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (evt: any) => {
          if (!evt.name?.trim()) {
            alert.message = translate('orgTemplates.enterFieldName');
            return false;
          }
          this.defaultFields.push({
            id: crypto.randomUUID(),
            name: evt.name.trim(),
            conductor: evt.conductor?.trim() || '',
            info: evt.info?.trim() || undefined,
            time: evt.time ? String(evt.time) : '20',
          });
          await this.saveDefaultFields();
        },
      }],
    });
    await alert.present();
  }

  async changeDefaultField(field: FieldSelection, slider: IonItemSliding) {
    slider.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    const inputs: AlertInput[] = [{
      type: 'textarea',
      label: translate('orgTemplates.fieldName'),
      name: 'name',
      value: clone.name,
      placeholder: translate('orgTemplates.fieldNamePh'),
    }, {
      type: 'textarea',
      label: translate('typeSettings.performer'),
      name: 'conductor',
      value: clone.conductor,
      placeholder: translate('orgTemplates.performerOptPh'),
    }, {
      type: 'number',
      label: translate('orgTemplates.minutes'),
      name: 'time',
      value: clone.time ? Number(clone.time) : 20,
    }];

    const alert = await this.alertController.create({
      header: translate('typeSettings.editField'),
      inputs,
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.save'),
        handler: async (evt: any) => {
          if (!evt.name?.trim()) {
            alert.message = translate('orgTemplates.enterFieldName');
            return false;
          }
          field.name = evt.name.trim();
          field.conductor = evt.conductor?.trim() || '';
          field.time = evt.time ? String(evt.time) : field.time;
          await this.saveDefaultFields();
        },
      }],
    });
    await alert.present();
  }

  async removeDefaultField(index: number, slider: IonItemSliding) {
    slider.close();
    this.defaultFields.splice(index, 1);
    await this.saveDefaultFields();
  }

  async handleDefaultFieldReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.defaultFields);
    await this.saveDefaultFields();
  }

  async saveDefaultFields() {
    await this.db.updateOrgDefaultFields(this.defaultFields);
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async addTemplate() {
    const alert = await this.alertController.create({
      header: translate('orgTemplates.addTemplate'),
      inputs: [{
        type: 'text',
        name: 'title',
        placeholder: translate('orgTemplates.templateNamePh'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (evt: any) => {
          if (!evt.title?.trim()) {
            alert.message = translate('orgTemplates.enterName');
            return false;
          }
          this.templates.push({ title: evt.title.trim(), time: '', end: '', fields: [] });
          this.templateEnds.push('');
          this.selectedTemplateIndex = this.templates.length - 1;
          await this.saveTemplates();
        },
      }],
    });
    await alert.present();
  }

  async renameTemplate(template: Plan, slider: IonItemSliding) {
    slider.close();
    const alert = await this.alertController.create({
      header: translate('orgTemplates.renameTemplate'),
      inputs: [{
        type: 'text',
        name: 'title',
        value: template.title,
        placeholder: translate('orgTemplates.templateNamePh'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.save'),
        handler: async (evt: any) => {
          if (!evt.title?.trim()) {
            alert.message = translate('orgTemplates.enterName');
            return false;
          }
          template.title = evt.title.trim();
          await this.saveTemplates();
        },
      }],
    });
    await alert.present();
  }

  async removeTemplate(index: number, slider: IonItemSliding) {
    slider.close();
    this.templates.splice(index, 1);
    this.templateEnds.splice(index, 1);
    if (this.selectedTemplateIndex === index) {
      this.selectedTemplateIndex = null;
    } else if (this.selectedTemplateIndex > index) {
      this.selectedTemplateIndex--;
    }
    await this.saveTemplates();
  }

  toggleTemplate(index: number) {
    this.selectedTemplateIndex = this.selectedTemplateIndex === index ? null : index;
  }

  async saveTemplates() {
    await this.db.updateOrgPlanningTemplates(this.templates);
  }

  // ── Per-template field editing ──────────────────────────────────────────────

  addOrgDefaultField(field: FieldSelection, tpl: Plan, index: number, popover: IonPopover) {
    popover.dismiss();
    tpl.fields.push({ ...field, id: crypto.randomUUID() });
    this.updateTemplateEnd(tpl, index);
    this.saveTemplates();
  }

  async addExtraField(tpl: Plan, index: number, popover: IonPopover) {
    await popover.dismiss();
    const alert = await this.alertController.create({
      header: translate('typeSettings.addField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('typeSettings.freeTextPh'),
      }, {
        type: 'textarea',
        name: 'conductor',
        placeholder: translate('typeSettings.performerPh'),
      }, {
        type: 'textarea',
        name: 'info',
        placeholder: translate('typeSettings.infoOptional'),
      }, {
        type: 'number',
        label: translate('orgTemplates.minutes'),
        name: 'time',
        value: 20,
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (evt: any) => {
          tpl.fields.push({
            id: evt.field || crypto.randomUUID(),
            name: evt.field || '',
            conductor: evt.conductor ?? '',
            info: evt.info?.trim() || undefined,
            time: evt.time ? String(evt.time) : '20',
          });
          this.updateTemplateEnd(tpl, index);
          await this.saveTemplates();
        },
      }],
    });
    await alert.present();
  }

  async addNoteField(tpl: Plan, index: number, popover: IonPopover) {
    await popover.dismiss();
    const alert = await this.alertController.create({
      header: translate('typeSettings.addNoteField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('typeSettings.notePh'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (evt: any) => {
          tpl.fields.push({
            id: `noteFld ${evt.field}`,
            name: evt.field,
            conductor: '',
            time: '0',
          });
          this.updateTemplateEnd(tpl, index);
          await this.saveTemplates();
        },
      }],
    });
    await alert.present();
  }

  addSongPlaceholder(tpl: Plan, index: number, popover: IonPopover) {
    popover.dismiss();
    const count = tpl.fields.filter(f => f.id?.startsWith('song-placeholder-')).length;
    tpl.fields.push({
      id: `song-placeholder-${count + 1}`,
      name: translate('typeSettings.songPlaceholderN', { n: count + 1 }),
      time: '20',
    });
    this.updateTemplateEnd(tpl, index);
    this.saveTemplates();
  }

  async changeField(field: FieldSelection, tpl: Plan, tplIndex: number, slider?: IonItemSliding) {
    slider?.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    let inputs: AlertInput[] = [{
      type: 'textarea',
      label: translate('typeSettings.programmeItem'),
      name: 'field',
      value: clone.name,
      placeholder: translate('typeSettings.programmeItemPh'),
    }, {
      type: 'textarea',
      label: translate('typeSettings.performer'),
      name: 'conductor',
      value: clone.conductor,
      placeholder: translate('typeSettings.performerPh'),
    }, {
      type: 'textarea',
      label: translate('typeSettings.info'),
      name: 'info',
      value: clone.info,
      placeholder: translate('typeSettings.infoOptionalDots'),
    }, {
      type: 'number',
      label: translate('orgTemplates.minutes'),
      name: 'time',
      value: clone.time ? Number(clone.time) : 20,
    }];

    if (field.id.includes('noteFld')) {
      inputs = [{
        type: 'textarea',
        label: translate('typeSettings.note'),
        name: 'field',
        value: clone.name,
        placeholder: translate('typeSettings.notePh'),
      }];
    }

    const alert = await this.alertController.create({
      header: translate('typeSettings.editField'),
      inputs,
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.save'),
        handler: async (evt: any) => {
          if (!evt.field) {
            alert.message = translate('typeSettings.enterItem');
            return false;
          }
          field.name = evt.field;
          field.conductor = evt.conductor ?? '';
          field.info = evt.info?.trim() || undefined;
          if (!field.id.includes('noteFld')) {
            field.time = evt.time ? String(evt.time) : field.time;
          }
          this.updateTemplateEnd(tpl, tplIndex);
          await this.saveTemplates();
        },
      }],
    });
    await alert.present();
  }

  async removeField(fieldIndex: number, tpl: Plan, tplIndex: number, slider: IonItemSliding) {
    slider.close();
    tpl.fields.splice(fieldIndex, 1);
    this.updateTemplateEnd(tpl, tplIndex);
    await this.saveTemplates();
  }

  async handleReorder(ev: CustomEvent<ItemReorderEventDetail>, tpl: Plan, tplIndex: number) {
    ev.detail.complete(tpl.fields);
    this.updateTemplateEnd(tpl, tplIndex);
    await this.saveTemplates();
  }

  calculateTime(field: FieldSelection, fieldIndex: number, tpl: Plan): string {
    if (!tpl.time) { return ''; }
    let minutesToAdd = 0;
    for (let i = 0; i < fieldIndex; i++) {
      minutesToAdd += Number(tpl.fields[i].time);
    }
    const base = dayjs(tpl.time).isValid()
      ? dayjs(tpl.time)
      : dayjs().hour(Number(tpl.time.substring(0, 2))).minute(Number(tpl.time.substring(3, 5)));
    return `${base.add(minutesToAdd, 'minute').format('HH:mm')}${field.conductor ? ` | ${field.conductor}` : ''}`;
  }

  onStartTimeChange(tpl: Plan, tplIndex: number) {
    this.updateTemplateEnd(tpl, tplIndex);
    this.saveTemplates();
  }

  updateTemplateEndPublic(tpl: Plan, index: number) {
    this.updateTemplateEnd(tpl, index);
  }

  private updateTemplateEnd(tpl: Plan, index: number) {
    this.templateEnds[index] = this.computeEnd(tpl);
  }

  private computeEnd(tpl: Plan): string {
    if (!tpl.time || !tpl.fields.length) { return ''; }
    let current = dayjs(tpl.time).isValid()
      ? dayjs(tpl.time)
      : dayjs().hour(Number(tpl.time.substring(0, 2))).minute(Number(tpl.time.substring(3, 5)));
    for (const f of tpl.fields) {
      current = current.add(parseInt(f.time) || 0, 'minutes');
    }
    return current.format('YYYY-MM-DDTHH:mm');
  }

  templateDuration(tpl: Plan): string {
    const total = tpl.fields.reduce((sum, f) => sum + (parseInt(f.time) || 0), 0);
    if (!total) { return ''; }
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) { return translate('planning.minShort', { min: m }); }
    return m > 0 ? translate('orgTemplates.duration', { h, m }) : translate('orgTemplates.durationH', { h });
  }

  trackByIndex(index: number): number {
    return index;
  }
}
