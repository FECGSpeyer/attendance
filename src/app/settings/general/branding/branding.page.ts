import { Component, OnInit, inject } from '@angular/core';
import { NavController } from '@ionic/angular/lazy';
import { DbService } from '../../../services/db.service';
import { ImageService } from '../../../services/image/image.service';
import { Utils } from '../../../utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-branding',
  templateUrl: './branding.page.html',
  styleUrls: ['./branding.page.scss'],
  standalone: false,
})
export class BrandingPage implements OnInit {
  public db = inject(DbService);
  private imageSvc = inject(ImageService);
  private navController = inject(NavController);

  public logoUrl = '';
  public brandingText = '';
  public hasOrg = false;

  ngOnInit() {
    const org = this.db.organisation();
    this.hasOrg = Boolean(org);
    if (org) {
      this.logoUrl = org.logo_url ?? '';
      this.brandingText = org.branding_text ?? '';
    }
  }

  async onLogoSelect(evt: any) {
    const imgFile: File = evt.target.files?.[0];
    evt.target.value = '';

    if (!imgFile) { return; }
    if (imgFile.size > 2 * 1024 * 1024) {
      Utils.showToast(translate('branding.logoTooBig'), 'danger');
      return;
    }
    if (imgFile.type.substring(0, 5) !== 'image') {
      Utils.showToast(translate('branding.selectImage'), 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      this.logoUrl = await this.imageSvc.updateOrgLogo(this.db.organisation().id, imgFile);
      Utils.showToast(translate('branding.logoUploaded'), 'success');
    } catch (error) {
      Utils.showToast(error, 'danger');
    } finally {
      loading.dismiss();
    }
  }

  async removeLogo() {
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      await this.imageSvc.removeOrgLogo(this.db.organisation().id);
      this.logoUrl = '';
      Utils.showToast(translate('branding.logoRemoved'), 'success');
    } catch (error) {
      Utils.showToast(error, 'danger');
    } finally {
      loading.dismiss();
    }
  }

  async save() {
    const loading = await Utils.getLoadingElement(999999, translate('branding.saving'));
    await loading.present();
    try {
      await this.db.updateOrgBranding({
        logo_url: this.logoUrl || null,
        branding_text: this.brandingText?.trim() || null,
      });
      Utils.showToast(translate('branding.saved'), 'success');
    } catch (error) {
      Utils.showToast(error, 'danger');
    } finally {
      loading.dismiss();
    }
  }

  goBack(): void {
    this.navController.navigateBack('/tabs/settings/org-settings');
  }
}
