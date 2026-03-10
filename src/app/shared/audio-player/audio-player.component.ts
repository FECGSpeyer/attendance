import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AudioPlayerService } from 'src/app/services/audio-player/audio-player.service';

@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
})
export class AudioPlayerComponent {
  constructor(public audioPlayer: AudioPlayerService) {}

  onKnobMoveStart(): void {
    this.audioPlayer.startSeeking();
  }

  onKnobMoveEnd(event: CustomEvent): void {
    this.audioPlayer.stopSeeking(event.detail.value);
  }
}
