import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonicModule, IonModal, Platform } from '@ionic/angular/lazy';
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
  @ViewChild('content') private content?: IonContent;
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

  /**
   * On the web/PWA path the Capacitor keyboard events never fire, and Ionic's
   * `ion-content` inside a sheet modal does not auto-scroll focused inputs clear
   * of the browser's on-screen keyboard. We listen for the visual viewport to
   * shrink (the browser reporting the keyboard, incl. its suggestion/helper
   * toolbar) and then scroll the content by exactly the amount needed to lift
   * the textarea's bottom edge just above the keyboard. `scrollIntoView` alone
   * is unreliable here because it targets the (unshrunk) layout viewport, so the
   * field can still end up hidden behind the keyboard.
   */
  onCustomReasonFocus(): void {
    if (this.platform.is('capacitor')) {
      return;
    }

    const viewport = window.visualViewport;

    const lift = () => {
      const field = this.customReasonField?.nativeElement;
      if (!field) {
        return;
      }
      // The keyboard occupies everything below the visual viewport's bottom.
      const keyboardTop = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const fieldBottom = field.getBoundingClientRect().bottom;
      const margin = 12;
      const overlap = fieldBottom - (keyboardTop - margin);
      if (overlap > 0) {
        this.content?.getScrollElement().then((el) => {
          el.scrollTo({ top: el.scrollTop + overlap, behavior: 'smooth' });
        });
      }
    };

    if (viewport) {
      // Scroll once the keyboard has actually resized the viewport, so its
      // real height (incl. helper toolbar) is known; fall back after a delay.
      const onResize = () => {
        viewport.removeEventListener('resize', onResize);
        lift();
      };
      viewport.addEventListener('resize', onResize);
      setTimeout(() => {
        viewport.removeEventListener('resize', onResize);
        lift();
      }, 350);
    } else {
      setTimeout(lift, 350);
    }
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
