import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';

export type PlanShareScope = 'one' | 'all';
export type PlanShareAction = 'pdf' | 'pdf2x' | 'telegram' | 'telegram2x' | 'telegramImage';

export interface PlanShareChoice {
  scope: PlanShareScope;
  action: PlanShareAction;
}

/**
 * Share sheet for Termine with several Ablaufpläne: the known export options
 * plus a switch between "only this plan" and "all plans". Termine with a
 * single plan keep using the plain action sheet.
 */
@Component({
  selector: 'app-plan-share-sheet',
  templateUrl: './plan-share-sheet.component.html',
  standalone: true,
  imports: [TranslocoModule, CommonModule, IonicModule],
})
export class PlanShareSheetComponent {
  @Input() currentLabel = '';
  @Input() planCount = 2;
  @Input() hasChatId = false;

  scope: PlanShareScope = 'one';

  constructor(private modalController: ModalController) {}

  choose(action: PlanShareAction) {
    this.modalController.dismiss({ scope: this.scope, action } as PlanShareChoice, 'choose');
  }

  dismiss() {
    this.modalController.dismiss(null, 'cancel');
  }
}

export async function openPlanShareSheet(
  modalController: ModalController,
  props: { currentLabel: string; planCount: number; hasChatId: boolean },
): Promise<PlanShareChoice | null> {
  const modal = await modalController.create({
    component: PlanShareSheetComponent,
    componentProps: props,
    breakpoints: [0, props.hasChatId ? 0.75 : 0.5, 1],
    initialBreakpoint: props.hasChatId ? 0.75 : 0.5,
  });
  await modal.present();
  const { data, role } = await modal.onWillDismiss();
  return role === 'choose' ? (data as PlanShareChoice) : null;
}
