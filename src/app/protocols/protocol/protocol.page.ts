import {
  Component,
  Input,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { JSONContent } from '@tiptap/core';
import { TiptapEditorComponent } from 'src/app/shared/tiptap-editor/tiptap-editor.component';
import { DbService } from 'src/app/services/db.service';
import {
  AgendaItem,
  AgendaItemPriority,
  AgendaItemStatus,
  Attendance,
  FieldSelection,
  Person,
  Protocol,
  Task,
  TaskStatus,
  AGENDA_ITEMS_PLACEHOLDER_ID,
} from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-protocol',
  templateUrl: './protocol.page.html',
  styleUrls: ['./protocol.page.scss'],
  standalone: false,
})
export class ProtocolPage implements OnInit {
  @Input() attendanceId: number;
  @Input() inline = false;
  @ViewChildren(TiptapEditorComponent) editors: QueryList<TiptapEditorComponent>;

  public attendance: Attendance;
  public protocol: Protocol;
  public agendaItems: AgendaItem[] = [];
  public linkedAgendaItems: AgendaItem[] = [];
  public tasks: Task[] = [];
  public players: Person[] = [];
  public planFields: FieldSelection[] = [];
  public isSaving = false;
  public isLoading = true;
  public showSlashMenu = false;
  public slashMenuForFieldId: string | null = null;

  readonly AGENDA_ITEMS_PLACEHOLDER_ID = AGENDA_ITEMS_PLACEHOLDER_ID;
  private saveDebounceTimers = new Map<string, any>();

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    const [attendance, protocol, agendaItems, allPlayers] = await Promise.all([
      this.db.getAttendanceById(this.attendanceId),
      this.db.getProtocolForAttendance(this.attendanceId),
      this.db.getAgendaItemsForAttendance(this.attendanceId),
      this.db.getConductors(true),
    ]);

    this.attendance = attendance;
    this.agendaItems = await this.db.getAgendaItems();
    this.linkedAgendaItems = agendaItems;
    this.players = allPlayers.filter((p: Person) => !p.left);
    this.planFields = (attendance.plan?.fields ?? []).filter(
      (f: FieldSelection) => f.id !== AGENDA_ITEMS_PLACEHOLDER_ID
    );

    this.protocol = protocol ?? {
      attendance_id: this.attendanceId,
      tenant_id: this.db.tenant().id,
      content: {},
    };

    if (protocol) {
      this.tasks = await this.db.getTasksForProtocol(protocol.id);
    }
    this.isLoading = false;
  }

  getSectionContent(fieldId: string): Record<string, unknown> | null {
    return (this.protocol?.content?.[fieldId] as Record<string, unknown>) ?? null;
  }

  onSectionChange(fieldId: string, content: JSONContent) {
    if (!this.protocol.content) this.protocol.content = {};
    this.protocol.content[fieldId] = content as Record<string, unknown>;
    clearTimeout(this.saveDebounceTimers.get(fieldId));
    const timer = setTimeout(() => this.persistProtocol(), 800);
    this.saveDebounceTimers.set(fieldId, timer);
  }

  async persistProtocol() {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      const saved = await this.db.upsertProtocol(this.protocol);
      this.protocol.id = saved.id;
      this.protocol.updated_at = saved.updated_at;
    } catch (e) {
      console.error('Protocol save error:', e);
    } finally {
      this.isSaving = false;
    }
  }

  async createTaskInline(fieldId: string) {
    const alert = await this.alertController.create({
      header: 'Neue Aufgabe',
      inputs: [{ name: 'title', type: 'text', placeholder: 'Titel der Aufgabe' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Erstellen',
          handler: async (data) => {
            if (!data.title?.trim()) return;
            const loading = await Utils.getLoadingElement();
            await loading.present();
            const task = await this.db.addTask({
              title: data.title.trim(),
              status: 'open' as TaskStatus,
              priority: 'medium' as AgendaItemPriority,
              tenant_id: this.db.tenant().id,
              protocol_id: this.protocol.id ?? null,
              attendance_id: this.attendanceId,
            });
            this.tasks = [...this.tasks, task];
            // Insert task ref node into the relevant section editor
            const editorIndex = this.planFields.findIndex(f => f.id === fieldId);
            const editor = this.editors.toArray()[editorIndex];
            editor?.insertTaskRef({ id: task.id, title: task.title, status: task.status });
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  async addAgendaItem() {
    const alert = await this.alertController.create({
      header: 'Tagesordnungspunkt erstellen',
      inputs: [{ name: 'title', type: 'text', placeholder: 'Titel' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Erstellen',
          handler: async (data) => {
            if (!data.title?.trim()) return;
            const loading = await Utils.getLoadingElement();
            await loading.present();
            const item = await this.db.addAgendaItem({
              title: data.title.trim(),
              status: 'open' as AgendaItemStatus,
              priority: 'medium' as AgendaItemPriority,
              tenant_id: this.db.tenant().id,
            });
            await this.db.linkAgendaItemToAttendance(item.id, this.attendanceId);
            this.linkedAgendaItems = [...this.linkedAgendaItems, item];
            this.agendaItems = [...this.agendaItems, item];
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  async linkAgendaItemToProtocol() {
    const unlinkedItems = this.agendaItems.filter(
      a => a.status !== 'completed' && !this.linkedAgendaItems.find(l => l.id === a.id)
    );
    if (unlinkedItems.length === 0) {
      Utils.showToast('Keine weiteren offenen Tagesordnungspunkte vorhanden', 'warning');
      return;
    }
    const alert = await this.alertController.create({
      header: 'Tagesordnungspunkt verknüpfen',
      inputs: unlinkedItems.map(item => ({
        type: 'radio' as const,
        label: item.title,
        value: item.id,
      })),
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Verknüpfen',
          handler: async (selectedId: string) => {
            if (!selectedId) return;
            const item = this.agendaItems.find(a => a.id === selectedId);
            if (!item) return;
            await this.db.linkAgendaItemToAttendance(selectedId, this.attendanceId);
            this.linkedAgendaItems = [...this.linkedAgendaItems, item];
          }
        }
      ]
    });
    await alert.present();
  }

  async linkAgendaItem(fieldId: string) {
    const openItems = this.agendaItems.filter(a => a.status !== 'completed');
    if (openItems.length === 0) {
      Utils.showToast('Keine offenen Tagesordnungspunkte vorhanden', 'warning');
      return;
    }
    const alert = await this.alertController.create({
      header: 'Tagesordnungspunkt verknüpfen',
      inputs: openItems.map(item => ({
        type: 'radio' as const,
        label: item.title,
        value: item.id,
      })),
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Verknüpfen',
          handler: async (selectedId: string) => {
            if (!selectedId) return;
            const item = this.agendaItems.find(a => a.id === selectedId);
            if (!item) return;
            await this.db.linkAgendaItemToAttendance(selectedId, this.attendanceId);
            this.linkedAgendaItems = [...this.linkedAgendaItems, item];
            const editorIndex = this.planFields.findIndex(f => f.id === fieldId);
            const editor = this.editors.toArray()[editorIndex];
            editor?.insertAgendaItemRef({
              id: item.id, title: item.title, status: item.status, priority: item.priority,
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async toggleAgendaItemStatus(item: AgendaItem) {
    const newStatus: AgendaItemStatus = item.status === 'completed' ? 'open' : 'completed';
    await this.db.updateAgendaItem(item.id, { status: newStatus });
    item.status = newStatus;
  }

  dismiss() {
    this.modalController.dismiss({ protocolId: this.protocol?.id });
  }
}
