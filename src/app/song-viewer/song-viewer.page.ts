import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Group, History, Song, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-song-viewer',
  templateUrl: './song-viewer.page.html',
  styleUrls: ['./song-viewer.page.scss'],
})
export class SongViewerPage implements OnInit {
  public songs: Song[] = [];

  // TrackBy functions for performance
  trackByInstrumentId = (_: number, item: Group): number => item.id!;
  trackByHistoryId = (_: number, his: History): number => his.id ?? his.song!.id!;
  trackBySongId = (_: number, song: Song): number => song.id!;
  private tenantId: number;
  public tenantLongName: string;
  public tenantShortName: string;
  public currentSongs: { date: string, history: History[] }[] = [];
  public songSharingId: string;
  public tenantType: string;

  constructor(
    public db: DbService,
    private router: Router,
  ) { }

  async ngOnInit() {
    const pathParts = window.location.pathname.split('/');
    this.songSharingId = pathParts[pathParts.length - 1];
    const tenantData: Tenant | null = await this.db.getTenantBySongSharingId(this.songSharingId);
    if (!tenantData) {
      Utils.showToast("Ungültiger Freigabe-Link.");
      return;
    }
    this.tenantId = tenantData.id;
    this.tenantLongName = tenantData.longName;
    this.tenantShortName = tenantData.shortName;
    this.tenantType = tenantData.type;
    this.songs = await this.db.getSongs(this.tenantId);
    this.currentSongs = (await this.db.getCurrentSongs(this.tenantId));
  }

  openSong(songId: number, modal: IonModal) {
    modal.dismiss();
    this.router.navigate([`${this.songSharingId}`, `${songId}`]);
  }

}
