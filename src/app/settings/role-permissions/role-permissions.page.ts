import { Component, HostListener, OnInit } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { TenantRolePermission } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

interface RoleSection {
  role: Role;
  label: string;
  permission?: TenantRolePermission;
}

@Component({
  selector: 'app-role-permissions',
  templateUrl: './role-permissions.page.html',
  styleUrls: ['./role-permissions.page.scss'],
  standalone: false
})
export class RolePermissionsPage implements OnInit {
  public roleSections: RoleSection[] = [];
  public filesShared = false;
  public canEditFilesShared = false;
  private originalState = '';

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      $event.returnValue = true;
    }
  }

  constructor(
    public db: DbService,
    private navController: NavController,
    private alertController: AlertController,
  ) {}

  ngOnInit() {
    const configurableRoles: { role: Role; label: string }[] = [
      { role: Role.HELPER, label: 'Helfer' },
      { role: Role.VOICE_LEADER_HELPER, label: 'Stimmführer-Helfer' },
      { role: Role.VOICE_LEADER, label: 'Stimmführer' },
      { role: Role.PLAYER, label: Utils.getRoleText(Role.PLAYER) },
      { role: Role.VIEWER, label: 'Beobachter' },
      { role: Role.PARENT, label: 'Eltern' },
    ];

    this.roleSections = configurableRoles.map(({ role, label }) => ({
      role,
      label,
      permission: this.db.getPermissionForRole(role),
    }));

    this.filesShared = this.db.tenant()?.files_shared || false;
    // Freigabe der Dateiablage: nur Admins (DB-Trigger protect_tenant_files_flags prüft das).
    this.canEditFilesShared = this.db.tenantUser()?.role === Role.ADMIN;

    this.originalState = this.getCurrentStateJson();
  }

  private getCurrentStateJson(): string {
    return JSON.stringify({ filesShared: this.filesShared, roles: this.roleSections.map(s => ({
      role: s.role,
      attendance_all_groups: s.permission?.attendance_all_groups,
      attendance_create: s.permission?.attendance_create,
      player_notes_view: s.permission?.player_notes_view,
      checklist_view: s.permission?.checklist_view,
      player_self_pause: s.permission?.player_self_pause,
      player_planned_absence: s.permission?.player_planned_absence,
    })) });
  }

  hasUnsavedChanges(): boolean {
    return this.getCurrentStateJson() !== this.originalState;
  }

  private markAsSaved(): void {
    this.originalState = this.getCurrentStateJson();
  }

  async navigateBack(): Promise<void> {
    if (this.hasUnsavedChanges()) {
      const shouldLeave = await this.confirmUnsavedChanges();
      if (!shouldLeave) {return;}
    }
    this.navController.back();
  }

  private async confirmUnsavedChanges(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: 'Ungespeicherte Änderungen',
        message: 'Du hast ungespeicherte Änderungen. Möchtest du sie speichern bevor du die Seite verlässt?',
        buttons: [
          {
            text: 'Abbrechen',
            role: 'cancel',
            handler: () => resolve(false)
          },
          {
            text: 'Verwerfen',
            role: 'destructive',
            handler: () => resolve(true)
          },
          {
            text: 'Speichern',
            handler: async () => {
              await this.save();
              resolve(true);
            }
          }
        ]
      });
      await alert.present();
    });
  }

  async save(): Promise<void> {
    try {
      for (const section of this.roleSections) {
        if (section.permission?.id) {
          await this.db.updateRolePermission(section.permission.id, {
            attendance_all_groups: section.permission.attendance_all_groups,
            attendance_create: section.permission.attendance_create,
            player_notes_view: section.permission.player_notes_view,
            checklist_view: section.permission.checklist_view,
            player_self_pause: section.permission.player_self_pause,
            player_planned_absence: section.permission.player_planned_absence,
          });
        }
      }
      if (this.canEditFilesShared && this.filesShared !== (this.db.tenant()?.files_shared || false)) {
        await this.db.updateTenantData({ files_shared: this.filesShared });
      }
      this.markAsSaved();
      Utils.showToast('Rollenberechtigungen gespeichert', 'success');
    } catch {
      Utils.showToast('Fehler beim Speichern der Rollenberechtigungen', 'danger');
    }
  }

  showAttendanceToggle(role: Role): boolean {
    return [Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }

  showAttendanceCreateToggle(role: Role): boolean {
    return [Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }

  showNotesToggle(role: Role): boolean {
    return [Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }

  showChecklistToggle(role: Role): boolean {
    return [Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }

  showSelfPauseToggle(role: Role): boolean {
    return role === Role.PLAYER;
  }

  showPlannedAbsenceToggle(role: Role): boolean {
    return [Role.PLAYER, Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }

  hasAnyToggle(role: Role): boolean {
    return this.showAttendanceToggle(role) || this.showAttendanceCreateToggle(role) || this.showNotesToggle(role) || this.showChecklistToggle(role) || this.showSelfPauseToggle(role) || this.showPlannedAbsenceToggle(role);
  }
}
