import { Component, inject, OnInit } from '@angular/core';
import { AlertController, IonModal, NavController } from '@ionic/angular/lazy';
import { PlayerService } from 'src/app/services/player/player.service';
import { DbService } from 'src/app/services/db.service';
import { FieldType } from 'src/app/utilities/constants';
import { ExtraField } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-extra-fields',
  templateUrl: './extra-fields.page.html',
  styleUrls: ['./extra-fields.page.scss'],
  standalone: false
})
export class ExtraFieldsPage implements OnInit {
  public fieldTypes = FieldType;

  // Person extra fields
  public extraFields: ExtraField[] = [];
  private originalExtraFields: ExtraField[] = [];
  public newExtraField: ExtraField = this.emptyField();
  public editingExtraField: ExtraField | null = null;
  public editingExtraFieldIndex = -1;
  public isEditExtraFieldModalOpen = false;

  // Song extra fields
  public songExtraFields: ExtraField[] = [];
  private originalSongExtraFields: ExtraField[] = [];
  public newSongExtraField: ExtraField = this.emptyField();
  public editingSongExtraField: ExtraField | null = null;
  public editingSongExtraFieldIndex = -1;
  public isEditSongExtraFieldModalOpen = false;

  private playerSvc = inject(PlayerService);

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private navController: NavController,
  ) {}

  ngOnInit() {
    this.extraFields = [...(this.db.tenant().additional_fields ?? [])].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));
    this.originalExtraFields = [...(this.db.tenant().additional_fields ?? [])].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));
    this.songExtraFields = [...(this.db.tenant().song_additional_fields ?? [])].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));
    this.originalSongExtraFields = [...(this.db.tenant().song_additional_fields ?? [])].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));
  }

  private emptyField(): ExtraField {
    return { id: '', name: '', type: FieldType.TEXT, defaultValue: false, options: [], visibleToPlayers: false, editableByPlayers: false };
  }

  getFieldTypeName(type: FieldType): string {
    switch (type) {
      case FieldType.TEXT: return 'Text';
      case FieldType.TEXTAREA: return 'Textbereich';
      case FieldType.NUMBER: return 'Zahl';
      case FieldType.SELECT: return 'Auswahl';
      case FieldType.DATE: return 'Datum';
      case FieldType.BOOLEAN: return 'Ja/Nein';
      default: return 'Unbekannt';
    }
  }

  setDefaultValue(target: 'person' | 'song') {
    const field = target === 'person' ? this.newExtraField : this.newSongExtraField;
    if (field.type === FieldType.BOOLEAN) {
      field.defaultValue = false;
    } else {
      field.defaultValue = Utils.getFieldTypeDefaultValue(field.type, undefined, field.options, this.db.churches());
    }
  }

  onExtraOptionChanged(event: any, index: number, target: 'person' | 'song') {
    const field = target === 'person' ? this.newExtraField : this.newSongExtraField;
    field.options[index] = event.detail.value;
  }

  onEditExtraOptionChanged(event: any, index: number, target: 'person' | 'song') {
    const field = target === 'person' ? this.editingExtraField : this.editingSongExtraField;
    if (field) { field.options[index] = event.detail.value; }
  }

  addExtraField(modal: IonModal, target: 'person' | 'song') {
    const fields = target === 'person' ? this.extraFields : this.songExtraFields;
    const field = target === 'person' ? this.newExtraField : this.newSongExtraField;

    if (!field.name.trim()) {
      Utils.showToast('Bitte gib einen gültigen Namen für das Zusatzfeld ein.', 'danger');
      return;
    }

    if (field.type === FieldType.BFECG_CHURCH) {
      field.id = 'bfecg_church';
    } else {
      field.id = field.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    if (fields.find(f => f.id === field.id)) {
      Utils.showToast('Ein Zusatzfeld mit dieser ID existiert bereits. Bitte wähle einen anderen Namen.', 'danger');
      return;
    }

    if (field.type === FieldType.SELECT) {
      if (!field.options?.length) {
        Utils.showToast('Bitte füge mindestens eine Option für das Auswahlfeld hinzu.', 'danger');
        return;
      }
      if (field.options.some(opt => !opt.trim())) {
        Utils.showToast('Optionen dürfen nicht leer sein.', 'danger');
        return;
      }
      field.defaultValue = field.options[0];
    }

    if (!field.id) {
      Utils.showToast('Die ID des Zusatzfeldes darf nicht leer sein.', 'danger');
      return;
    }

    fields.push({ ...field });
    if (target === 'person') {
      this.newExtraField = this.emptyField();
    } else {
      this.newSongExtraField = this.emptyField();
    }
    modal.dismiss();
  }

  async removeExtraField(index: number, target: 'person' | 'song') {
    const fields = target === 'person' ? this.extraFields : this.songExtraFields;
    const alert = await this.alertController.create({
      header: 'Zusatzfeld löschen?',
      message: `Möchtest du das Zusatzfeld '${fields[index].name}' wirklich löschen?`,
      buttons: [{ text: 'Abbrechen' }, {
        text: 'Löschen',
        handler: () => { fields.splice(index, 1); }
      }]
    });
    await alert.present();
  }

  openEditExtraField(index: number, target: 'person' | 'song') {
    const fields = target === 'person' ? this.extraFields : this.songExtraFields;
    if (target === 'person') {
      this.editingExtraFieldIndex = index;
      this.editingExtraField = { ...fields[index], options: [...(fields[index].options || [])] };
      this.isEditExtraFieldModalOpen = true;
    } else {
      this.editingSongExtraFieldIndex = index;
      this.editingSongExtraField = { ...fields[index], options: [...(fields[index].options || [])] };
      this.isEditSongExtraFieldModalOpen = true;
    }
  }

  closeEditExtraFieldModal(target: 'person' | 'song') {
    if (target === 'person') {
      if (!this.editingExtraField || this.editingExtraFieldIndex === -1) {
        this.isEditExtraFieldModalOpen = false;
        return;
      }
      if (this.editingExtraField.type === FieldType.SELECT && this.editingExtraField.options?.length) {
        this.editingExtraField.defaultValue = this.editingExtraField.options[0];
      }
      this.extraFields[this.editingExtraFieldIndex] = { ...this.editingExtraField };
      this.isEditExtraFieldModalOpen = false;
      this.editingExtraField = null;
      this.editingExtraFieldIndex = -1;
    } else {
      if (!this.editingSongExtraField || this.editingSongExtraFieldIndex === -1) {
        this.isEditSongExtraFieldModalOpen = false;
        return;
      }
      if (this.editingSongExtraField.type === FieldType.SELECT && this.editingSongExtraField.options?.length) {
        this.editingSongExtraField.defaultValue = this.editingSongExtraField.options[0];
      }
      this.songExtraFields[this.editingSongExtraFieldIndex] = { ...this.editingSongExtraField };
      this.isEditSongExtraFieldModalOpen = false;
      this.editingSongExtraField = null;
      this.editingSongExtraFieldIndex = -1;
    }
  }

  async removeEditExtraOption(index: number, target: 'person' | 'song') {
    const editingField = target === 'person' ? this.editingExtraField : this.editingSongExtraField;
    const savedFields = target === 'person' ? this.extraFields : this.songExtraFields;
    const savedIndex = target === 'person' ? this.editingExtraFieldIndex : this.editingSongExtraFieldIndex;

    if (!editingField) { return; }

    const optionToRemove = editingField.options[index];
    const isExistingOption = savedFields[savedIndex]?.options?.includes(optionToRemove);

    if (isExistingOption && optionToRemove) {
      const alert = await this.alertController.create({
        header: 'Option löschen?',
        message: `Wenn du die Option "${optionToRemove}" löschst, werden alle betroffenen Datensätze auf den Standardwert zurückgesetzt.`,
        buttons: [{ text: 'Abbrechen' }, {
          text: 'Löschen',
          handler: async () => {
            const newDefault = editingField.options[0] === optionToRemove
              ? (editingField.options[1] || '')
              : editingField.options[0];
            if (target === 'person') {
              try {
                const count = await this.playerSvc.updateExtraFieldValue(this.db.tenant().id, editingField.id, optionToRemove, newDefault);
                editingField.options.splice(index, 1);
                if (count > 0) { Utils.showToast(`${count} Personen aktualisiert`, 'success'); }
              } catch { /* service shows toast */ }
            } else {
              editingField.options.splice(index, 1);
            }
          }
        }]
      });
      await alert.present();
    } else {
      editingField.options.splice(index, 1);
    }
  }

  async resetExtraFieldValues(target: 'person' | 'song') {
    const editingField = target === 'person' ? this.editingExtraField : this.editingSongExtraField;
    if (!editingField) { return; }

    const alert = await this.alertController.create({
      header: 'Werte zurücksetzen?',
      message: `Möchtest du alle Werte des Feldes '${editingField.name}' auf den Standardwert zurücksetzen? Dies kann nicht rückgängig gemacht werden!`,
      buttons: [{ text: 'Abbrechen' }, {
        text: 'Zurücksetzen',
        handler: async () => {
          if (target !== 'person') { return; }
          const resolved = Utils.getFieldTypeDefaultValue(
            editingField.type,
            editingField.type === FieldType.SELECT ? undefined : editingField.defaultValue,
            editingField.options,
            this.db.churches()
          );
          try {
            const count = await this.playerSvc.resetExtraFieldValues(this.db.tenant().id, editingField.id, resolved);
            Utils.showToast(`${count} Personen aktualisiert`, 'success');
          } catch { /* service shows toast */ }
        }
      }]
    });
    await alert.present();
  }

  async save() {
    for (const field of [...this.extraFields, ...this.songExtraFields]) {
      if (!field.name?.trim()) {
        Utils.showToast('Alle Zusatzfelder müssen einen Namen haben.', 'danger');
        return;
      }
      if (field.type === FieldType.SELECT) {
        if (!field.options?.length) {
          Utils.showToast(`Das Auswahlfeld "${field.name}" muss mindestens eine Option haben.`, 'danger');
          return;
        }
        if (field.options.some(opt => !opt?.trim())) {
          Utils.showToast(`Die Optionen im Feld "${field.name}" dürfen nicht leer sein.`, 'danger');
          return;
        }
      }
    }

    const loading = await Utils.getLoadingElement(999999, 'Felder werden gespeichert...');
    await loading.present();

    try {
      await this.db.updateTenantData({
        additional_fields: this.extraFields,
        song_additional_fields: this.songExtraFields,
      });

      await this.sanitizePlayerAdditionalFields();
      await this.backfillSongAdditionalFields();

      this.originalExtraFields = [...this.extraFields].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));
      this.originalSongExtraFields = [...this.songExtraFields].map(f => ({ ...f, options: f.options ? [...f.options] : [] }));

      await loading.dismiss();
      Utils.showToast('Felder gespeichert', 'success');
    } catch {
      await loading.dismiss();
      Utils.showToast('Fehler beim Speichern', 'danger');
    }
  }

  private haveFieldsChanged(current: ExtraField[], original: ExtraField[]): boolean {
    if (current.length !== original.length) { return true; }
    const origIds = new Set(original.map(f => f.id));
    const currIds = new Set(current.map(f => f.id));
    for (const id of origIds) { if (!currIds.has(id)) { return true; } }
    for (const id of currIds) { if (!origIds.has(id)) { return true; } }
    for (const cur of current) {
      if (cur.type !== FieldType.SELECT) { continue; }
      const orig = original.find(f => f.id === cur.id);
      if (!orig) { continue; }
      const origOpts = orig.options || [];
      const curOpts = cur.options || [];
      if (origOpts.length !== curOpts.length) { return true; }
      for (const opt of origOpts) { if (!curOpts.includes(opt)) { return true; } }
    }
    return false;
  }

  private async sanitizePlayerAdditionalFields(): Promise<void> {
    try {
      const players = await this.db.getPlayers();
      const validIds = new Set(this.extraFields.map(f => f.id));
      for (const player of players) {
        const fields: Record<string, any> = { ...(player.additional_fields || {}) };
        let changed = false;

        // Remove fields that no longer exist
        for (const id of Object.keys(fields)) {
          if (!validIds.has(id)) { delete fields[id]; changed = true; }
        }

        // Seed missing fields with defaults; fix invalid SELECT values
        for (const def of this.extraFields) {
          const cur = fields[def.id];
          if (cur === undefined || cur === null) {
            fields[def.id] = Utils.getFieldTypeDefaultValue(def.type, def.defaultValue, def.options, this.db.churches());
            changed = true;
          } else if (def.type === FieldType.SELECT && def.options && !def.options.includes(cur)) {
            fields[def.id] = Utils.getFieldTypeDefaultValue(def.type, def.defaultValue, def.options);
            changed = true;
          }
        }

        if (changed) {
          await this.playerSvc.updatePlayerAdditionalFields(player.id, fields);
        }
      }
    } catch (e) {
      console.warn('Could not sanitize player additional fields:', e);
    }
  }

  private async backfillSongAdditionalFields(): Promise<void> {
    try {
      const songs = await this.db.getSongs();
      const validIds = new Set(this.songExtraFields.map(f => f.id));
      for (const song of songs) {
        const fields: Record<string, any> = { ...(song.additional_fields || {}) };
        let changed = false;

        for (const id of Object.keys(fields)) {
          if (!validIds.has(id)) { delete fields[id]; changed = true; }
        }

        for (const def of this.songExtraFields) {
          const cur = fields[def.id];
          if (cur === undefined || cur === null) {
            fields[def.id] = Utils.getFieldTypeDefaultValue(def.type, def.defaultValue, def.options);
            changed = true;
          } else if (def.type === FieldType.SELECT && def.options && !def.options.includes(cur)) {
            fields[def.id] = Utils.getFieldTypeDefaultValue(def.type, def.defaultValue, def.options);
            changed = true;
          }
        }

        if (changed) {
          await this.db.editSong(song.id, { additional_fields: fields } as any);
        }
      }
    } catch (e) {
      console.warn('Could not backfill song additional fields:', e);
    }
  }

  navigateBack() {
    this.navController.back();
  }
}
