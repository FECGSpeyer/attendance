import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';

/** Small chip row to switch between the Ablaufpläne of one Termin. */
@Component({
  selector: 'app-plan-chips',
  templateUrl: './plan-chips.component.html',
  styleUrls: ['./plan-chips.component.scss'],
  standalone: true,
  imports: [TranslocoModule, CommonModule, IonicModule],
})
export class PlanChipsComponent {
  @Input() labels: string[] = [];
  @Input() selected = 0;
  /** Index of today's plan; gets a "heute" suffix. */
  @Input() todayIndex = -1;
  @Output() selectedChange = new EventEmitter<number>();

  select(index: number) {
    if (index !== this.selected) {
      this.selectedChange.emit(index);
    }
  }
}
