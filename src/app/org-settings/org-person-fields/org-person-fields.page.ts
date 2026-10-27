import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal, ItemReorderEventDetail, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { FieldType, Role } from 'src/app/utilities/constants';
import { ExtraField } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-org-person-fields',
  templateUrl: './org-person-fields.page.html',
  styleUrls: ['./org-person-fields.page.scss'],
  standalone: false,
})
export class OrgPersonFieldsPage implements OnInit {
  public fieldTypes = FieldType;
  public fields: ExtraField[] = [];
  private originalFieldIds = new Set<string>();
  public newField = this.emptyField();
  public editingField: ExtraField | null = null;
  public editingFieldIndex = -1;
  public isEditModalOpen = false;
  public isSaving = false;
  public readonly isSuperAdmin: boolean;

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private navController: NavController,
  ) {
    this.isSuperAdmin = this.db.tenantUser()?.role === Role.ADMIN;
  }

  ngOnInit(): void {
    this.fields = (this.db.organisation()?.additional_fields ?? [])
      .map(field => ({ ...field, options: [...(field.options ?? [])] }));
    this.originalFieldIds = new Set(this.fields.map(field => field.id));
  }

  getFieldTypeName(type: FieldType): string {
    switch (type) {
      case FieldType.TEXT: return translate('typeSettings.text');
      case FieldType.TEXTAREA: return translate('extraFields.textarea');
      case FieldType.NUMBER: return translate('extraFields.number');
      case FieldType.DATE: return translate('attendance.date');
      case FieldType.BOOLEAN: return translate('extraFields.yesNo');
      case FieldType.SELECT: return translate('extraFields.select');
      default: return translate('common.unknown');
    }
  }

  addField(modal: IonModal): void {
    const organisationId = this.db.organisation()?.id;
    const name = this.newField.name.trim();
    if (!organisationId || !name) {
      Utils.showToast(translate('extraFields.invalidName'), 'danger');
      return;
    }

    const id = `org_${organisationId}_${this.toFieldId(name)}`;
    if (this.fields.some(field => field.id === id)) {
      Utils.showToast(translate('orgFields.nameExists'), 'danger');
      return;
    }

    const field: ExtraField = {
      ...this.newField,
      id,
      name,
      options: [...(this.newField.options ?? [])],
    };
    if (field.type === FieldType.SELECT) {
      field.options = (field.options ?? []).filter(option => option.trim());
      if (!field.options.length) {
        Utils.showToast(translate('orgFields.addOption'), 'danger');
        return;
      }
      field.defaultValue = field.options[0];
    }

    this.fields.push(field);
    this.newField = this.emptyField();
    modal.dismiss();
  }

  async removeField(index: number): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('extraFields.deleteField'),
      message: translate('extraFields.deleteFieldMessage', { name: this.fields[index].name }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('common.delete'), role: 'destructive', handler: () => this.fields.splice(index, 1) },
      ],
    });
    await alert.present();
  }

  openEditField(index: number): void {
    this.editingFieldIndex = index;
    this.editingField = {
      ...this.fields[index],
      options: [...(this.fields[index].options ?? [])],
    };
    this.isEditModalOpen = true;
  }

  closeEditFieldModal(saveChanges = false): void {
    if (saveChanges && this.editingField && this.editingFieldIndex >= 0) {
      if (this.editingField.type === FieldType.SELECT) {
        const options = (this.editingField.options ?? []).map(option => option.trim()).filter(Boolean);
        if (!options.length) {
          Utils.showToast(translate('orgFields.addOption'), 'danger');
          return;
        }
        this.editingField.options = options;
        this.editingField.defaultValue = options[0];
      }
      this.fields[this.editingFieldIndex] = { ...this.editingField };
    }
    this.isEditModalOpen = false;
    this.editingField = null;
    this.editingFieldIndex = -1;
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    this.fields = ev.detail.complete([...this.fields]);
  }

  updateOptions(field: ExtraField, value: string): void {
    field.options = value.split(',').map(option => option.trim()).filter(option => option.length > 0);
    if (field.type === FieldType.SELECT) {
      field.defaultValue = field.options[0] ?? '';
    }
  }

  onNewFieldTypeChanged(): void {
    this.newField.defaultValue = this.newField.type === FieldType.BOOLEAN
      ? false
      : Utils.getFieldTypeDefaultValue(this.newField.type, undefined, this.newField.options, this.db.churches());
  }

  addNewOption(): void {
    this.newField.options = [...(this.newField.options ?? []), ''];
  }

  updateNewOption(index: number, value: string): void {
    if (!this.newField.options) { return; }
    this.newField.options[index] = value;
  }

  removeNewOption(index: number): void {
    this.newField.options?.splice(index, 1);
  }

  addEditOption(): void {
    if (!this.editingField) { return; }
    this.editingField.options = [...(this.editingField.options ?? []), ''];
  }

  updateEditOption(index: number, value: string): void {
    if (!this.editingField?.options) { return; }
    this.editingField.options[index] = value;
  }

  removeEditOption(index: number): void {
    this.editingField?.options?.splice(index, 1);
  }

  async save(): Promise<void> {
    if (!this.isSuperAdmin) { return; }
    for (const field of this.fields) {
      if (!field.name.trim() || !field.id.startsWith(`org_${this.db.organisation()?.id}_`)) {
        Utils.showToast(translate('orgFields.invalid'), 'danger');
        return;
      }
      if (field.type === FieldType.SELECT && !(field.options ?? []).length) {
        Utils.showToast(translate('orgFields.needsOptions', { name: field.name }), 'danger');
        return;
      }
    }

    this.isSaving = true;
    try {
      const currentFieldIds = new Set(this.fields.map(field => field.id));
      const deletedFieldIds = [...this.originalFieldIds].filter(fieldId => !currentFieldIds.has(fieldId));
      await this.db.updateOrgExtraFields(this.fields);
      await this.db.deleteSharedPersonFieldValues(deletedFieldIds);
      this.originalFieldIds = currentFieldIds;
      Utils.showToast(translate('orgFields.saved'), 'success');
    } finally {
      this.isSaving = false;
    }
  }

  goBack(): void {
    this.navController.back();
  }

  private emptyField(): ExtraField {
    return {
      id: '',
      name: '',
      type: FieldType.TEXT,
      defaultValue: '',
      options: [],
      visibleToPlayers: false,
      editableByPlayers: false,
      displayMode: 'chip',
    };
  }

  private toFieldId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
}
