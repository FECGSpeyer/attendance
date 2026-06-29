import { Component, OnInit } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonPopover, ItemReorderEventDetail } from '@ionic/angular';
import dayjs from 'dayjs';
import { FieldSelection } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import {
  PUBLIC_PLANNING_TEMPLATES,
  PublicPlanningTemplate,
  cloneTemplateFields,
} from './public-planning-templates';

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

  public planTitle = 'Ablaufplan';
  public date: string = dayjs().format('YYYY-MM-DD');
  public time: string = dayjs().hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
  public end = '';
  public selectedFields: FieldSelection[] = [];

  constructor(
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  trackByFieldId = (_: number, f: FieldSelection): string => f.id;

  ngOnInit() {
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
        { type: 'text',     name: 'conductor', placeholder: 'Ausführender (optional)' },
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
    const isNote = field.id.includes('noteFld');
    const inputs: any[] = isNote
      ? [{ name: 'field', value: field.name, placeholder: 'Notiz' }]
      : [
          { name: 'field',     value: field.name,      placeholder: 'Programmpunkt' },
          { name: 'conductor', value: field.conductor, placeholder: 'Ausführender' },
        ];
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Updaten',
          handler: (evt: any) => {
            if (!evt.field) {
              alert.message = 'Bitte einen Programmpunkt eingeben.';
              return false;
            }
            field.name = evt.field;
            field.conductor = evt.conductor ?? '';
            this.calculateEnd();
          }
        },
      ],
    });
    await alert.present();
  }

  removeField(index: number, slider: IonItemSliding) {
    this.selectedFields.splice(index, 1);
    slider.close();
    this.calculateEnd();
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
    await Utils.createPlanExport(
      { time: this.time, end: this.end, fields: this.selectedFields, sideBySide },
      this.planTitle?.trim() || 'Ablaufplan',
    );
  }

  async showExportOptions() {
    if (!this.validate()) {return;}
    const buttons: ActionSheetButton[] = [
      { text: 'PDF (A4)',       handler: () => this.export(false) },
      { text: 'PDF (2x A5)',    handler: () => this.export(true) },
      { text: 'Abbrechen',      role: 'cancel' },
    ];
    const actionSheet = await this.actionSheetController.create({
      header: 'Exportieren',
      buttons,
    });
    await actionSheet.present();
  }

  async resetPlan() {
    const alert = await this.alertController.create({
      header: 'Plan zurücksetzen',
      message: 'Alle Felder entfernen?',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Zurücksetzen',
          handler: () => {
            this.selectedFields = [];
            this.calculateEnd();
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
        selectedFields: this.selectedFields,
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
      this.selectedFields = s.selectedFields;
      return true;
    } catch {
      return false;
    }
  }
}
