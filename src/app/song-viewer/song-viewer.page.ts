import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { SongPage } from 'src/app/songs/song/song.page';
import { History, Song } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-song-viewer',
  templateUrl: './song-viewer.page.html',
  styleUrls: ['./song-viewer.page.scss'],
})
export class SongViewerPage implements OnInit {
  public songs: Song[] = [];
  private tenantId: number;
  public tenantLongName: string;
  public tenantShortName: string;
  public currentSongs: { date: string; history: History[] }[] = [];

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet
  ) { }

  async ngOnInit() {
    const pathParts = window.location.pathname.split('/');
    const songSharingId = pathParts[pathParts.length - 1];
    const tenantData: {id: number, longName: string, shortName: string} | null = await this.db.getTenantDataBySongSharingId(songSharingId);
    if (!tenantData) {
      Utils.showToast("Ungültiger Freigabe-Link.");
      return;
    }
    this.tenantId = tenantData.id;
    this.tenantLongName = tenantData.longName;
    this.tenantShortName = tenantData.shortName;
    this.songs = await this.db.getSongs(this.tenantId);
    this.currentSongs = await this.db.getCurrentSongs(this.tenantId);
  }

  async openSong(songId: number | undefined) {
    if (!songId) return;

    const modal = await this.modalController.create({
      component: SongPage,
      componentProps: {
        songId
      },
      presentingElement: this.routerOutlet.nativeEl,
    });
    await modal.present();
  }

}
