import { Component, HostListener, OnInit } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular';
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
  private originalState: string = '';

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
      { role: Role.PLAYER, label: 'Spieler' },
      { role: Role.VIEWER, label: 'Beobachter' },
      { role: Role.PARENT, label: 'Eltern' },
    ];

    this.roleSections = configurableRoles.map(({ role, label }) => ({
      role,
      label,
      permission: this.db.getPermissionForRole(role),
    }));

    this.originalState = this.getCurrentStateJson();
  }

  private getCurrentStateJson(): string {
    return JSON.stringify(this.roleSections.map(s => ({
      role: s.role,
      attendance_all_groups: s.permission?.attendance_all_groups,
    })));
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
      if (!shouldLeave) return;
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
          });
        }
      }
      this.markAsSaved();
      Utils.showToast("Rollenberechtigungen gespeichert", "success");
    } catch {
      Utils.showToast("Fehler beim Speichern der Rollenberechtigungen", "danger");
    }
  }

  showAttendanceToggle(role: Role): boolean {
    return [Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
  }
}
