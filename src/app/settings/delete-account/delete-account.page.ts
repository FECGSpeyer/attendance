import { Component } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.page.html',
  styleUrls: ['./delete-account.page.scss'],
  standalone: false
})
export class DeleteAccountPage {
  public confirmText = '';
  // Randomly generated each time the page is opened — prevents muscle-memory
  // confirmations and forces the user to actively read and re-type the code.
  public readonly verificationCode: string = this.generateCode();

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private navController: NavController,
    private tracking: TrackingService,
  ) {}

  private generateCode(): string {
    // Avoid visually ambiguous chars (0/O, 1/I/L). 6 chars = ~36^6 = 2.1B combinations.
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 6; i++) {
      out += chars[buf[i] % chars.length];
    }
    return out;
  }

  canDelete(): boolean {
    return this.confirmText.trim().toUpperCase() === this.verificationCode;
  }

  async deleteAccount(): Promise<void> {
    if (!this.canDelete()) return;

    const alert = await this.alertController.create({
      header: translate('deleteAccount.confirm'),
      message: translate('deleteAccount.confirmMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('deleteAccount.deleteFinal'),
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement(60000, translate('deleteAccount.deleting'));
            await loading.present();
            try {
              this.tracking.track(TrackingEvent.AccountDeleted);
              await this.db.deleteAccount();
              await loading.dismiss();
              Utils.showToast(translate('deleteAccount.deleted'), 'success', 4000);
            } catch (error: any) {
              await loading.dismiss();
              Utils.showToast(translate('deleteAccount.failed', { error: error?.message || translate('common.unknown') }), 'danger', 5000);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  goBack(): void {
    this.navController.navigateBack('/tabs/settings');
  }
}
