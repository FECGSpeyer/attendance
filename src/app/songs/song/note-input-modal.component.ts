import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { IonInput } from '@ionic/angular';

@Component({
  selector: 'app-note-input-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ header }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item lines="full">
        <ion-input
          #noteInput
          [(ngModel)]="value"
          [placeholder]="placeholder"
          (keyup.enter)="save()"
          autocapitalize="sentences"
          enterkeyhint="done"></ion-input>
      </ion-item>
      <ion-button expand="block" class="ion-margin-top" (click)="save()">Speichern</ion-button>
    </ion-content>
  `,
})
export class NoteInputModalComponent implements AfterViewInit {
  @Input() header = 'Sonstige Kategorie eingeben';
  @Input() placeholder = 'Beliebige Kategorie eingeben...';
  @Input() value = '';

  @ViewChild('noteInput', { static: false }) noteInput!: IonInput;

  constructor(private modalController: ModalController) {}

  ngAfterViewInit(): void {
    // setFocus() on ion-input goes through Ionic's overlay-aware focus path,
    // which iOS PWA accepts as a continuation of the user's tap that opened
    // the modal. A small delay ensures the modal's enter animation has
    // completed before iOS evaluates the focus call.
    setTimeout(() => this.noteInput?.setFocus(), 250);
  }

  save(): void {
    this.modalController.dismiss(this.value ?? '', 'save');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
