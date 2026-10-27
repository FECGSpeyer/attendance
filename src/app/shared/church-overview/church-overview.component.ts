import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { Church } from 'src/app/utilities/interfaces';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

interface ChurchCount {
  name: string;
  count: number;
}

@Component({
  selector: 'app-church-overview',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './church-overview.component.html',
  styleUrls: ['./church-overview.component.scss'],
})
export class ChurchOverviewComponent implements OnInit {
  /** Gemeinde-IDs der zu zählenden Personen (null/leer = keine Gemeinde) */
  @Input() churchIds: (string | null | undefined)[] = [];
  @Input() churches: Church[] = [];
  @Input() subtitle = translate('common.people');

  churchCounts: ChurchCount[] = [];
  withoutChurch = 0;
  total = 0;

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    const countMap = new Map<string, number>();
    this.total = this.churchIds.length;

    for (const id of this.churchIds) {
      if (!id) {
        this.withoutChurch++;
        continue;
      }
      countMap.set(id, (countMap.get(id) ?? 0) + 1);
    }

    this.churchCounts = [...countMap.entries()]
      .map(([id, count]) => ({
        name: this.churches.find(c => c.id === id)?.name ?? translate('churchOverview.unknownChurch'),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  close(): void {
    this.modalController.dismiss();
  }
}
