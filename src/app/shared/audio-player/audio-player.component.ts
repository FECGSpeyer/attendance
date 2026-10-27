import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { AudioPlayerService } from 'src/app/services/audio-player/audio-player.service';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
})
export class AudioPlayerComponent {
  constructor(public audioPlayer: AudioPlayerService) {}

  onPrevious(): void {
    this.audioPlayer.previous().catch((error) => this.showError(error));
  }

  onNext(): void {
    this.audioPlayer.next().catch((error) => this.showError(error));
  }

  onKnobMoveStart(): void {
    this.audioPlayer.startSeeking();
  }

  onKnobMoveEnd(event: CustomEvent): void {
    this.audioPlayer.stopSeeking(event.detail.value);
  }

  private showError(error: any): void {
    Utils.showToast(translate('audio.playFailed', { error: error?.message || error }), 'danger');
  }
}
