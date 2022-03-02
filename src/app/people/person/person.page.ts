import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonSelect, ModalController, Platform } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Player } from 'src/app/utilities/interfaces';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
})
export class PersonPage implements OnInit, OnDestroy {
  @Input() existingPlayer: Player;
  @Input() instruments: Instrument[];
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;
  keyboardSub;

  public newPlayer: Player = {
    firstName: "",
    lastName: "",
    instrument: 1,
    playsSince: new Date().toISOString(),
    joined: new Date().toISOString(),
    birthday: new Date().toISOString(),
    hasTeacher: false,
    isLeader: false,
    notes: "",
  };
  public player: Player;
  public birthdayString: string = format(new Date(), 'dd.MM.yyyy');
  public playsSinceString: string = format(new Date(), 'dd.MM.yyyy');
  public joinedString: string = format(new Date(), 'dd.MM.yyyy');
  public max: string = new Date().toISOString();

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private platform: Platform
  ) { }

  ngOnInit() {
    if (this.existingPlayer) {
      this.player = { ...this.existingPlayer };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.formatDate(this.existingPlayer.playsSince);
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.db.getPlayerAttendance();
      this.keyboardSub = this.platform.keyboardDidShow.subscribe(ev =>
        {
          this.content.scrollToBottom();
        });
    } else {
      this.player = { ...this.newPlayer };
      this.player.instrument = this.instruments[0].id;
    }
  }

  ngOnDestroy(): void {
      this.keyboardSub.unsubscribe();
  }

  formatDate(value: string) {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  dismiss(): void {
    this.modalController.dismiss();
  }

  async addPlayer(): Promise<void> {
    await this.db.addPlayer(this.player);
    this.modalController.dismiss({
      added: true
    });
  }

  async updatePlayer(): Promise<void> {
    await this.db.updatePlayer(this.player);
    this.modalController.dismiss({
      added: true
    });
  }

  scrollDown(): void {
    //this.content.scrollToBottom();
  }

}
