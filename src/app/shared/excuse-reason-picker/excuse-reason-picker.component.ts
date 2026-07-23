import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, IonModal, Platform } from '@ionic/angular';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';

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
  @ViewChild('customReasonField', { read: ElementRef }) private customReasonField?: ElementRef<HTMLElement>;

  readonly customReasonValue = CUSTOM_REASON;

  isLate = false;
  reasonSelection = '';
  customReason = '';

  private keyboardShowListener?: PluginListenerHandle;

  constructor(private platform: Platform) {}

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
    this.registerKeyboardListener();
  }

  onReasonChange(): void {
    // Expand the sheet to full height when the free-text field is revealed so
    // there is scroll room to lift the textarea above the keyboard; shrink back
    // to the compact height for the plain radio list.
    this.modal.setCurrentBreakpoint(this.reasonSelection === CUSTOM_REASON ? 1 : 0.6);
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
    this.dismiss();
  }

  dismiss(): void {
    this.modal.dismiss();
  }

  onDidDismiss(): void {
    // Clean up the keyboard listener regardless of how the sheet was closed
    // (confirm, cancel button, backdrop tap, or swipe-down gesture).
    this.removeKeyboardListener();
  }

  private registerKeyboardListener(): void {
    if (!this.platform.is('capacitor') || this.keyboardShowListener) {
      return;
    }
    // When the native keyboard appears, scroll the textarea into view so it is
    // not hidden behind the keyboard.
    Keyboard.addListener('keyboardWillShow', () => {
      this.customReasonField?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).then((handle) => {
      this.keyboardShowListener = handle;
    });
  }

  private removeKeyboardListener(): void {
    this.keyboardShowListener?.remove();
    this.keyboardShowListener = undefined;
  }
}
