import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, IonModal } from '@ionic/angular';

const CUSTOM_REASON = 'Sonstiger Grund';

@Component({
  selector: 'app-excuse-reason-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './excuse-reason-picker.component.html',
  styleUrls: ['./excuse-reason-picker.component.scss'],
})
export class ExcuseReasonPickerComponent {
  @Input() absenceReasons: string[] = [];
  @Input() lateReasons: string[] = [];

  @Output() confirm = new EventEmitter<{ reason: string; isLate: boolean }>();

  @ViewChild('modal') private modal: IonModal;

  readonly customReasonValue = CUSTOM_REASON;

  isLate = false;
  reasonSelection = '';
  customReason = '';

  get reasons(): string[] {
    return this.isLate ? this.lateReasons : this.absenceReasons;
  }

  /**
   * Opens the reason sheet.
   * @param isLate  true = "Verspätung", false = "Abmeldung".
   * @param isToday when the event is today we default to the free-text reason
   *                (matches the previous isAttToday behaviour); otherwise we
   *                preselect the first predefined reason.
   */
  async open(isLate: boolean, isToday: boolean): Promise<void> {
    this.isLate = isLate;
    this.customReason = '';
    this.reasonSelection = isToday ? CUSTOM_REASON : (this.reasons[0] ?? CUSTOM_REASON);
    await this.modal.present();
  }

  onReasonChange(): void {
    // Grow the sheet only when the free-text field is revealed so the keyboard
    // does not cover it; shrink back for the plain radio list.
    this.modal.setCurrentBreakpoint(this.reasonSelection === CUSTOM_REASON ? 0.9 : 0.6);
  }

  isConfirmable(): boolean {
    if (this.reasonSelection === CUSTOM_REASON) {
      const value = this.customReason ?? '';
      return value.trim().length > 4;
    }
    return !!this.reasonSelection;
  }

  onConfirm(): void {
    const reason = this.reasonSelection === CUSTOM_REASON ? this.customReason.trim() : this.reasonSelection;
    this.confirm.emit({ reason, isLate: this.isLate });
    this.modal.dismiss();
  }

  dismiss(): void {
    this.modal.dismiss();
  }
}
