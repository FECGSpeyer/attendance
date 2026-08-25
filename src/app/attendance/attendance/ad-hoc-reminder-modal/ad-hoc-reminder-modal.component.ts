import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular/lazy';

export interface AdHocReminderResult {
  title: string;
  message: string;
}

@Component({
  selector: 'app-ad-hoc-reminder-modal',
  templateUrl: './ad-hoc-reminder-modal.component.html',
  standalone: false
})
export class AdHocReminderModalComponent implements OnInit {
  @Input() defaultTitle = '';
  @Input() defaultMessage = '';
  @Input() attendanceLink = '';

  title = '';
  message = '';

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    this.title = this.defaultTitle;
    this.message = this.defaultMessage;
  }

  cancel(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  send(): void {
    void this.modalController.dismiss({ title: this.title, message: this.message } as AdHocReminderResult, 'send');
  }
}
