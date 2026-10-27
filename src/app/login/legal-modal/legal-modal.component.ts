import { Component } from '@angular/core';
import { ModalController, IonicModule } from '@ionic/angular/lazy';
import { LegalContentComponent } from './legal-content.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-legal-modal',
  templateUrl: './legal-modal.component.html',
  styleUrls: ['./legal-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, LegalContentComponent, TranslocoModule]
})
export class LegalModalComponent {
  constructor(private modalController: ModalController) {}

  dismiss() {
    this.modalController.dismiss();
  }
}
