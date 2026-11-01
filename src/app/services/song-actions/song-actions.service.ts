import { Injectable, inject } from '@angular/core';
import { ActionSheetController, isPlatform } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { translate } from '@jsverse/transloco';
import { DbService } from '../db.service';
import { AudioPlayerService } from '../audio-player/audio-player.service';
import { PrintService } from '../print/print.service';
import { Song, SongFile } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

/**
 * Score actions for members (Noten anzeigen / herunterladen / drucken, Aufnahme, Liedtext).
 * Shared by the signout page, the Werke sheet of a Termin and the Ablaufplan viewer.
 */
@Injectable({ providedIn: 'root' })
export class SongActionsService {
  private db = inject(DbService);
  private actionSheetCtrl = inject(ActionSheetController);
  private audioPlayer = inject(AudioPlayerService);
  private printService = inject(PrintService);

  /**
   * Whether the Werk has scores for the instrument (Stimme). In choirs,
   * files marked "Chor (alle)" count for every singer.
   */
  hasNotesForInstrument(song: Song | undefined, instrumentId: number | undefined): boolean {
    if (!song) { return false; }
    const hasInstrumentId = !!instrumentId && song.instrument_ids?.includes(instrumentId);
    if (this.db.tenant()?.type === 'choir') {
      return hasInstrumentId || !!song.files?.some(file => Utils.isChoirAllFile(file));
    }
    return !!hasInstrumentId;
  }

  /** The score file to print for the instrument, falling back to "Chor (alle)" in choirs. */
  printFileFor(song: Song, instrumentId: number | undefined): SongFile | undefined {
    let file = song.files?.find(f => f.instrumentId === instrumentId);
    if (!file && this.db.tenant()?.type === 'choir') {
      file = song.files?.find(f => Utils.isChoirAllFile(f));
    }
    return file;
  }

  /** Prints the scores of several Werke for the instrument as one PDF. */
  async printScores(songs: Song[], instrumentId: number | undefined, fileName: string): Promise<void> {
    const entries: { song: Song; file: SongFile }[] = [];
    for (const song of songs) {
      const file = song ? this.printFileFor(song, instrumentId) : undefined;
      if (file) {
        entries.push({ song, file });
      }
    }
    if (!entries.length) {
      Utils.showToast(translate('signout.noScoresFound'), 'warning');
      return;
    }
    await this.printService.printEntries(entries, fileName);
  }

  async openSongOptions(song: Song, instrumentId: number | undefined) {
    if (instrumentId && !this.hasNotesForInstrument(song, instrumentId)) {
      Utils.showToast(translate('signout.noScoresForInstrument'), 'danger', 4000);
    }

    const buttons = [];

    if (song.link) {
      buttons.push({
        text: translate('signout.openScoreLink'),
        handler: () => Browser.open({ url: song.link }),
      });
    }

    // Get files for player's instrument or Chor notes
    let files = (song.files ?? []).filter((file: SongFile) => file.instrumentId === instrumentId);

    // For choir type, also include files with "Chor (alle)"
    if (this.db.tenant().type === 'choir') {
      const choirFiles = (song.files ?? []).filter((file: SongFile) => Utils.isChoirAllFile(file));
      files = [...files, ...choirFiles];
      // Remove duplicates if a file is both for the instrument and has "Chor" note
      files = files.filter((file, index, self) =>
        index === self.findIndex(f => f.fileName === file.fileName)
      );
    }

    if (files.length === 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: translate('signout.downloadScores'),
          handler: async () => {
            const file = files[0];
            if (file) {
              if (Utils.downloadInMacBrowser(file.url, file.fileName)) { return; }
              const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
              Utils.downloadFileNative(blob, file.fileName);
            }
          },
        });
      }

      buttons.push({
        text: translate('signout.showScores'),
        handler: () => {
          const file = files[0];
          if (file) {
            Utils.openFileNative(file.url, file.fileName);
          }
        },
      });

      buttons.push({
        text: translate('signout.printScores'),
        handler: async () => {
          const file = files[0];
          if (file) {
            await this.printService.printSongFile(song, file);
          }
        },
      });
    } else if (files.length > 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: translate('signout.downloadScores'),
          handler: async () => {
            const fileOptions = files.map((file: SongFile) => {
              return {
                text: file.fileName,
                role: '',
                handler: async () => {
                  if (Utils.downloadInMacBrowser(file.url, file.fileName)) { return; }
                  const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
                  Utils.downloadFileNative(blob, file.fileName);
                },
              };
            });

            fileOptions.push({
              text: translate('common.cancel'),
              role: 'destructive',
              handler: () => Promise.resolve(),
            });

            const fileActionSheet = await this.actionSheetCtrl.create({
              header: translate('signout.chooseScoresFor', { song: `${song.number}. ${song.name}` }),
              buttons: fileOptions,
            });

            await fileActionSheet.present();
          },
        });
      }

      buttons.push({
        text: translate('signout.showScores'),
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetCtrl.create({
            header: translate('signout.chooseScoresFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });

      buttons.push({
        text: translate('signout.printScores'),
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: async () => {
                await this.printService.printSongFile(song, file);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetCtrl.create({
            header: translate('signout.printScoresFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    const audioFile = (song.files ?? []).find(f => f.instrumentId === 1);
    if (audioFile) {
      buttons.push({
        text: translate('signout.listenRecording'),
        handler: () => {
          this.audioPlayer.play(audioFile, `${song.number} ${song.name}`);
        },
      });
      buttons.push({
        text: translate('signout.downloadRecording'),
        handler: async () => {
          if (Utils.downloadInMacBrowser(audioFile.url, audioFile.fileName)) { return; }
          const blob = await this.db.downloadSongFile(audioFile.storageName ?? audioFile.url.split('/').pop(), song.id);
          Utils.downloadFileNative(blob, audioFile.fileName);
        },
      });
    }

    const liedtextFiles = (song.files ?? []).filter((file: SongFile) => file.instrumentId === 2);
    if (liedtextFiles.length === 1) {
      buttons.push({
        text: translate('signout.viewLyrics'),
        handler: () => {
          const file = liedtextFiles[0];
          Utils.openFileNative(file.url, file.fileName);
        },
      });
    } else if (liedtextFiles.length > 1) {
      buttons.push({
        text: translate('signout.viewLyrics'),
        handler: async () => {
          const fileOptions = liedtextFiles.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetCtrl.create({
            header: translate('signout.chooseLyricsFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      handler: () => { },
      role: 'destructive',
      data: {
        action: 'cancel',
      },
    });

    if (buttons.length === 1) {
      Utils.showToast(translate('signout.noSongActions'), 'warning', 4000);
      return;
    }

    const actionSheet = await this.actionSheetCtrl.create({
      header: `${song.number}. ${song.name}`,
      buttons,
    });

    await actionSheet.present();
  }
}
