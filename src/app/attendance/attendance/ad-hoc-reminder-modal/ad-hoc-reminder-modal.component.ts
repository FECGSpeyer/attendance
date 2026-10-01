import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular/lazy';

export interface AdHocReminderResult {
  title: string;
  message: string;
  neutralOnly: boolean;
}

@Component({
  selector: 'app-ad-hoc-reminder-modal',
  templateUrl: './ad-hoc-reminder-modal.component.html',
  styleUrls: ['./ad-hoc-reminder-modal.component.scss'],
  standalone: false
})
export class AdHocReminderModalComponent implements OnInit {
  @Input() defaultTitle = '';
  @Input() defaultMessage = '';
  @Input() attendanceLink = '';
  @Input() hasNeutralPersons = false;

  title = '';
  message = '';
  neutralOnly = false;

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    this.title = this.defaultTitle;
    this.message = this.defaultMessage;
  }

  cancel(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  send(): void {
    void this.modalController.dismiss({ title: this.title, message: this.message, neutralOnly: this.neutralOnly } as AdHocReminderResult, 'send');
  }
}
