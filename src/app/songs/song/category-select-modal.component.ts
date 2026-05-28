import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, IonInput } from '@ionic/angular';
import { Group } from 'src/app/utilities/interfaces';

export interface CategorySelectResult {
  instrumentId: number | null;
  note: string;
}

@Component({
  selector: 'app-category-select-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Kategorie ändern</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-radio-group [(ngModel)]="instrumentId" (ionChange)="onSelectionChange()">
        <ion-item lines="full">
          <ion-radio [value]="null" labelPlacement="end">Sonstige (Freitext möglich)</ion-radio>
        </ion-item>
        <ion-item lines="full">
          <ion-radio [value]="1" labelPlacement="end">Aufnahme</ion-radio>
        </ion-item>
        <ion-item lines="full">
          <ion-radio [value]="2" labelPlacement="end">Liedtext</ion-radio>
        </ion-item>
        <ion-item lines="full" *ngFor="let inst of instruments">
          <ion-radio [value]="inst.id" labelPlacement="end">{{ inst.name }}</ion-radio>
        </ion-item>
      </ion-radio-group>

      <ion-item lines="full" *ngIf="instrumentId === null" class="ion-margin-top">
        <ion-input
          #noteInput
          [(ngModel)]="note"
          placeholder="Beliebige Kategorie eingeben..."
          (keyup.enter)="save()"
          autocapitalize="sentences"
          enterkeyhint="done"></ion-input>
      </ion-item>

      <ion-button expand="block" class="ion-margin-top" (click)="save()">Speichern</ion-button>
    </ion-content>
  `,
})
export class CategorySelectModalComponent implements AfterViewInit {
  @Input() instruments: Group[] = [];
  @Input() instrumentId: number | null = null;
  @Input() note = '';

  @ViewChild('noteInput', { static: false }) noteInput?: IonInput;

  constructor(private modalController: ModalController, private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    if (this.instrumentId === null) {
      setTimeout(() => this.noteInput?.setFocus(), 250);
    }
  }

  onSelectionChange(): void {
    if (this.instrumentId === null) {
      setTimeout(() => this.noteInput?.setFocus(), 50);
    }
  }

  save(): void {
    const result: CategorySelectResult = {
      instrumentId: this.instrumentId,
      note: this.instrumentId === null ? (this.note ?? '') : '',
    };
    this.modalController.dismiss(result, 'save');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
