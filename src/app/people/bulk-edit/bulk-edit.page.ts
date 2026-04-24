import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { ExtraField, Group, Player } from 'src/app/utilities/interfaces';
import { FieldType } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';

interface FieldOption {
  key: string;
  label: string;
  type: 'standard' | 'extra';
  fieldType?: FieldType;
  extraField?: ExtraField;
}

@Component({
  selector: 'app-bulk-edit',
  templateUrl: './bulk-edit.page.html',
  styleUrls: ['./bulk-edit.page.scss'],
  standalone: false
})
export class BulkEditPage implements OnInit {
  @Input() players: Player[] = [];

  fieldOptions: FieldOption[] = [];
  selectedFieldKey = '';
  selectedField: FieldOption | null = null;

  /** Per-player edited values: playerId → new value */
  editedValues: Map<number, any> = new Map();
  /** Original values for change detection: playerId → original value */
  originalValues: Map<number, any> = new Map();

  /** "Set for all" value */
  bulkValue: any = null;

  isSaving = false;

  readonly FieldType = FieldType;

  constructor(
    private modalController: ModalController,
    public db: DbService
  ) {}

  ngOnInit() {
    this.buildFieldOptions();
  }

  private buildFieldOptions() {
    this.fieldOptions = [
      { key: 'instrument', label: 'Gruppe', type: 'standard' },
      { key: 'isLeader', label: 'Stimmführer', type: 'standard' },
      { key: 'notes', label: 'Notizen', type: 'standard' },
      { key: 'phone', label: 'Telefon', type: 'standard' },
    ];

    const extraFields = this.db.tenant()?.additional_fields || [];
    for (const field of extraFields) {
      this.fieldOptions.push({
        key: `extra_${field.id}`,
        label: field.name,
        type: 'extra',
        fieldType: field.type,
        extraField: field,
      });
    }
  }

  onFieldSelected() {
    this.selectedField = this.fieldOptions.find(f => f.key === this.selectedFieldKey) || null;
    this.editedValues.clear();
    this.originalValues.clear();
    this.bulkValue = this.getDefaultBulkValue();

    if (this.selectedField) {
      for (const player of this.players) {
        const val = this.getPlayerFieldValue(player);
        this.originalValues.set(player.id, val);
        this.editedValues.set(player.id, val);
      }
    }
  }

  getPlayerFieldValue(player: Player): any {
    if (!this.selectedField) {return null;}

    if (this.selectedField.type === 'standard') {
      return (player as any)[this.selectedField.key] ?? null;
    }

    // Extra field
    const fieldId = this.selectedField.extraField.id;
    return player.additional_fields?.[fieldId] ?? null;
  }

  getEditedValue(playerId: number): any {
    return this.editedValues.get(playerId);
  }

  setEditedValue(playerId: number, value: any) {
    this.editedValues.set(playerId, value);
  }

  private getDefaultBulkValue(): any {
    if (!this.selectedField) {return null;}

    if (this.selectedField.type === 'standard') {
      switch (this.selectedField.key) {
        case 'instrument': return this.db.groups()?.[0]?.id ?? null;
        case 'isLeader': return false;
        case 'notes': return '';
        case 'phone': return '';
        default: return null;
      }
    }

    // Extra field
    return Utils.getFieldTypeDefaultValue(
      this.selectedField.fieldType,
      undefined,
      this.selectedField.extraField?.options,
      this.db.churches()
    );
  }

  applyToAll() {
    for (const player of this.players) {
      this.editedValues.set(player.id, this.bulkValue);
    }
  }

  get changedCount(): number {
    let count = 0;
    for (const player of this.players) {
      const original = this.originalValues.get(player.id);
      const edited = this.editedValues.get(player.id);
      if (original !== edited) {count++;}
    }
    return count;
  }

  getGroupName(groupId: number): string {
    return this.db.groups()?.find((g: Group) => g.id === groupId)?.name || '';
  }

  async save() {
    if (this.changedCount === 0 || !this.selectedField) {return;}

    this.isSaving = true;
    try {
      if (this.db.isDemo()) {
        Utils.showToast('Diese Funktion ist im Demo-Modus nicht verfügbar.', 'warning');
        return;
      }

      const changedCount = this.changedCount;
      const updates: Promise<void>[] = [];

      for (const player of this.players) {
        const original = this.originalValues.get(player.id);
        const edited = this.editedValues.get(player.id);
        if (original === edited) {continue;}

        if (this.selectedField.type === 'standard') {
          updates.push(
            this.db.playerSvc.updatePlayerField(player.id, this.selectedField.key, edited)
          );
        } else {
          // Extra field: merge into existing additional_fields
          const merged = { ...(player.additional_fields || {}), [this.selectedField.extraField.id]: edited };
          updates.push(
            this.db.playerSvc.updatePlayerAdditionalFields(player.id, merged)
          );
        }
      }

      await Promise.all(updates);

      Utils.showToast(`${changedCount} Person(en) aktualisiert`, 'success');
      this.modalController.dismiss({ updated: true });
    } catch (error) {
      console.error('Bulk update error:', error);
      Utils.showToast('Fehler beim Speichern', 'danger');
    } finally {
      this.isSaving = false;
    }
  }

  dismiss() {
    this.modalController.dismiss();
  }
}
