import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { DataService } from 'src/app/services/data.service';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-handover-detail',
  templateUrl: './handover-detail.page.html',
  styleUrls: ['./handover-detail.page.scss'],
})
export class HandoverDetailPage implements OnInit {
  public handoverData: any;

  constructor(
    private dataService: DataService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.handoverData = this.dataService.getHandoverData();

    if (!this.handoverData) {
      Utils.showToast('Keine Daten für die Personenübergabe vorhanden.', 'danger');
      this.navCtrl.navigateBack('/tabs/settings/handover');
    }
  }

}
