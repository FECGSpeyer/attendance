import { Component } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { Utils } from 'src/app/utilities/Utils';

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
      header: 'Konto wirklich löschen?',
      message: 'Dein Konto und alle damit verbundenen Daten werden unwiderruflich entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Endgültig löschen',
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement(60000, 'Konto wird gelöscht...');
            await loading.present();
            try {
              this.tracking.track(TrackingEvent.AccountDeleted);
              await this.db.deleteAccount();
              await loading.dismiss();
              Utils.showToast('Dein Konto wurde gelöscht.', 'success', 4000);
            } catch (error: any) {
              await loading.dismiss();
              Utils.showToast(`Fehler beim Löschen: ${error?.message || 'Unbekannt'}`, 'danger', 5000);
            }
          }
        }
      ]
    });
    await alert.present();
  }
}
