import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule, translate } from '@jsverse/transloco';
import { AutoMessageService, RESPONSE_REASONS } from 'src/app/services/auto-message/auto-message.service';
import { Utils } from 'src/app/utilities/Utils';

/**
 * Sheet for a member to answer a Termin message: add a reason or say "I was
 * there". Dismisses with the new state ('pending' | 'accepted') on success.
 */
@Component({
  selector: 'app-attendance-response-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslocoModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ 'common.cancel' | transloco }}</ion-button>
        </ion-buttons>
        <ion-title>{{ 'autoMessages.respTitle' | transloco }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content color="light">
      <p class="termin">{{ termin }}</p>
      <ion-segment class="seg" [value]="kind" (ionChange)="kind = $any($event.detail.value)">
        <ion-segment-button value="reason"><ion-label>{{ 'autoMessages.respHadReason' | transloco }}</ion-label></ion-segment-button>
        <ion-segment-button value="was_present"><ion-label>{{ 'autoMessages.respWasThere' | transloco }}</ion-label></ion-segment-button>
      </ion-segment>

      @if (kind === 'reason') {
        <ion-list-header><ion-label>{{ 'autoMessages.respReason' | transloco }}</ion-label></ion-list-header>
        <div class="chips">
          @for (r of reasons; track r) {
            <ion-chip [outline]="reason !== r" [color]="reason === r ? 'primary' : 'medium'" (click)="reason = r">
              {{ 'autoMessages.reason.' + r | transloco }}
            </ion-chip>
          }
        </div>
        <ion-list [inset]="true">
          <ion-item>
            <ion-textarea [label]="'autoMessages.respText' | transloco" labelPlacement="stacked" [(ngModel)]="text" [autoGrow]="true" [maxlength]="500" rows="3"></ion-textarea>
          </ion-item>
        </ion-list>
        <p class="hint">{{ 'autoMessages.respHint' | transloco }}</p>
      } @else {
        <p class="hint">{{ 'autoMessages.respWasThereHint' | transloco }}</p>
      }

      <div class="actions">
        <ion-button expand="block" (click)="send()" [disabled]="sending">{{ 'autoMessages.respSend' | transloco }}</ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    .termin { text-align: center; color: var(--ion-color-medium); margin: 16px 16px 12px; }
    .seg { margin: 0 16px; width: auto; }
    .chips { display: flex; flex-wrap: wrap; margin: 0 12px; }
    .hint { margin: 8px 20px 0; color: var(--ion-color-medium); font-size: 0.8rem; line-height: 1.4; }
    .actions { margin: 20px 16px; }
  `],
})
export class AttendanceResponseModalComponent {
  private modalController = inject(ModalController);
  private service = inject(AutoMessageService);

  @Input() messageId = '';
  @Input() termin = '';
  @Input() kind: 'reason' | 'was_present' = 'reason';

  reasons = RESPONSE_REASONS;
  reason = 'sick';
  text = '';
  sending = false;

  cancel(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  async send(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      const result = await this.service.submitResponse(
        this.messageId,
        this.kind,
        this.kind === 'reason' ? this.reason : null,
        this.kind === 'reason' ? this.text.trim() : '',
      );
      await this.modalController.dismiss(result.state, 'sent');
    } catch (e) {
      console.error('[attendance-response] submit failed:', e);
      const message = (e as Error).message;
      Utils.showToast(translate(message === 'expired'
        ? 'autoMessages.respExpired'
        : message === 'alreadyDecided' ? 'autoMessages.respAlreadyDecided' : 'autoMessages.respFailed'), 'danger');
    } finally {
      this.sending = false;
    }
  }
}
