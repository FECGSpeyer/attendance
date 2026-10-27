import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService } from '../services/db.service';
import { FilesService } from '../services/files/files.service';
import { Utils } from '../utilities/Utils';
import { translate } from '@jsverse/transloco';

/**
 * Resolver route for shared Dateiablage links
 * (e.g. https://attendix.de/open-file?tenantId=7&path=Noten/Marsch.pdf).
 *
 * Authenticates, switches to the link's tenant if needed and then opens the
 * files page in the linked folder (folder=1) or in the file's parent folder
 * with the file opened. When not signed in, the link is stashed and resumed
 * by DbService.routeAfterAuth() after login.
 */
@Component({
  selector: 'app-open-file',
  templateUrl: './open-file.page.html',
  styleUrls: ['./open-file.page.scss'],
  standalone: false,
})
export class OpenFilePage implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private db: DbService,
    private filesSvc: FilesService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.resolveLink();
    } catch (error) {
      console.error('[open-file] resolve failed:', error);
      Utils.showToast(translate('openFile.linkFailed'), 'danger');
      await this.router.navigateByUrl('/login');
    }
  }

  private async resolveLink(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const tenantId = Number(params.get('tenantId'));
    const path = params.get('path') || '';
    const isFolder = params.get('folder') === '1';

    if (!tenantId || Number.isNaN(tenantId)) {
      await this.router.navigateByUrl('/login');
      return;
    }

    await this.db.checkToken();

    if (!this.db.tenantUser()) {
      const shareUrl = new URL(this.filesSvc.getShareLink(tenantId, path, isFolder));
      this.filesSvc.setPendingLink(shareUrl.pathname + shareUrl.search);
      await this.router.navigateByUrl('/login');
      return;
    }

    if (tenantId !== this.db.tenant()?.id) {
      if (!this.db.tenantUsers().some((tu) => tu.tenantId === tenantId)) {
        Utils.showToast(translate('openFile.noTenantAccess'), 'danger');
        await this.db.routeAfterAuth(undefined, this.db.tenant()?.id);
        return;
      }
      await this.db.setTenant(tenantId);
    }

    if (!this.db.canAccessFiles()) {
      Utils.showToast(translate('files.noAccess'), 'danger');
      await this.db.routeAfterAuth(undefined, tenantId);
      return;
    }

    const segments = path.split('/').filter(Boolean);
    const folder = isFolder ? segments.join('/') : segments.slice(0, -1).join('/');
    const queryParams: Record<string, string> = { path: folder, t: String(Date.now()) };
    if (!isFolder && segments.length) {
      queryParams['open'] = segments[segments.length - 1];
    }

    const navigated = await this.router.navigate(['/tabs/settings/files'], { queryParams, replaceUrl: true });
    if (!navigated) {
      // Navigation abgebrochen (z. B. Guard) – nicht auf dem Spinner hängen bleiben.
      Utils.showToast(translate('openFile.linkFailed'), 'danger');
      await this.db.routeAfterAuth(undefined, tenantId);
    }
  }
}
