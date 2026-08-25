import { Component, OnInit, inject } from '@angular/core';
import { DbService } from '../../../services/db.service';
import { ImageService } from '../../../services/image/image.service';
import { Utils } from '../../../utilities/Utils';

@Component({
  selector: 'app-branding',
  templateUrl: './branding.page.html',
  styleUrls: ['./branding.page.scss'],
  standalone: false,
})
export class BrandingPage implements OnInit {
  public db = inject(DbService);
  private imageSvc = inject(ImageService);

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
      Utils.showToast('Das Logo darf maximal 2MB groß sein.', 'danger');
      return;
    }
    if (imgFile.type.substring(0, 5) !== 'image') {
      Utils.showToast('Bitte wähle eine Bilddatei aus.', 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      this.logoUrl = await this.imageSvc.updateOrgLogo(this.db.organisation().id, imgFile);
      Utils.showToast('Logo hochgeladen. Speichern nicht vergessen.', 'success');
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
      Utils.showToast('Logo entfernt. Speichern nicht vergessen.', 'success');
    } catch (error) {
      Utils.showToast(error, 'danger');
    } finally {
      loading.dismiss();
    }
  }

  async save() {
    const loading = await Utils.getLoadingElement(999999, 'Branding wird gespeichert...');
    await loading.present();
    try {
      await this.db.updateOrgBranding({
        logo_url: this.logoUrl || null,
        branding_text: this.brandingText?.trim() || null,
      });
      Utils.showToast('Branding gespeichert.', 'success');
    } catch (error) {
      Utils.showToast(error, 'danger');
    } finally {
      loading.dismiss();
    }
  }
}
