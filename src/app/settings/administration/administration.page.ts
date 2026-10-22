import { Component, OnInit } from '@angular/core';
import { DbService } from '../../services/db.service';
import { Utils } from '../../utilities/Utils';

// Administration: nur für den Super-Developer (SuperDeveloperGuard).
// Sammelt instanzübergreifende Schalter und Werkzeuge wie das Usage Dashboard.
@Component({
  selector: 'app-administration',
  templateUrl: './administration.page.html',
  standalone: false,
})
export class AdministrationPage implements OnInit {
  public filesEnabled = false;
  public filesShared = false;
  public isSaving = false;

  constructor(public db: DbService) {}

  ngOnInit() {
    this.filesEnabled = this.db.tenant()?.files_enabled || false;
    this.filesShared = this.db.tenant()?.files_shared || false;
  }

  async saveFiles() {
    if (this.isSaving) { return; }
    this.isSaving = true;
    try {
      // DB-Trigger erlaubt die Änderung nur developer@attendix.de.
      await this.db.updateTenantData({
        files_enabled: this.filesEnabled,
        files_shared: this.filesEnabled ? this.filesShared : false,
      });
      this.filesShared = this.db.tenant()?.files_shared || false;
      Utils.showToast('Dateiablage gespeichert', 'success');
    } catch {
      this.filesEnabled = this.db.tenant()?.files_enabled || false;
      this.filesShared = this.db.tenant()?.files_shared || false;
    } finally {
      this.isSaving = false;
    }
  }
}
