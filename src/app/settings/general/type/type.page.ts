import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-type',
  templateUrl: './type.page.html',
  styleUrls: ['./type.page.scss'],
})
export class TypePage implements OnInit {
  @Input() isNew: boolean;

  constructor(
    public modalController: ModalController
  ) { }

  ngOnInit() {
  }

  async save() {

  }

  async createType() {

  }

  async deleteType() {

  }

  async dismiss() {
    await this.modalController.dismiss();
  }
}
