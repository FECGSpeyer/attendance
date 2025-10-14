import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';

@Component({
  selector: 'app-handover',
  templateUrl: './handover.page.html',
  styleUrls: ['./handover.page.scss'],
})
export class HandoverPage implements OnInit {

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    await this.db.getPlayers();
  }

}
