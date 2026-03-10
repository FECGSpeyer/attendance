import { Injectable, signal, WritableSignal } from '@angular/core';
import { SongFile } from 'src/app/utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class AudioPlayerService {
  public currentFile: WritableSignal<SongFile | null> = signal(null);
  public currentSongName: WritableSignal<string> = signal('');
  public isPlaying: WritableSignal<boolean> = signal(false);
  /** Progress value 0–100 for ion-range */
  public progress: WritableSignal<number> = signal(0);
  public currentTime: WritableSignal<number> = signal(0);
  public duration: WritableSignal<number> = signal(0);

  private audio: HTMLAudioElement | null = null;
  private _isSeeking = false;

  /** Audio file extensions recognised as playable */
  private static readonly AUDIO_EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.webm', '.opus',
  ];

  /**
   * Check whether a SongFile is an audio file.
   * Uses MIME type first, falls back to file extension.
   */
  static isAudioFile(file: { fileType?: string; fileName?: string; name?: string }): boolean {
    if (file.fileType?.startsWith('audio/')) {
      return true;
    }
    const name = (file.fileName || file.name || '').toLowerCase();
    return AudioPlayerService.AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
  }

  /** Start playing a file. Stops any previous playback. */
  play(file: SongFile, songName: string): void {
    this.stop();

    this.audio = new Audio(file.url);
    this.currentFile.set(file);
    this.currentSongName.set(songName);

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audio?.duration ?? 0);
    });

    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio || this._isSeeking) return;
      this.currentTime.set(this.audio.currentTime);
      const dur = this.audio.duration;
      this.progress.set(dur > 0 ? (this.audio.currentTime / dur) * 100 : 0);
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying.set(false);
      this.progress.set(0);
      this.currentTime.set(0);
    });

    this.audio.play().then(() => {
      this.isPlaying.set(true);
    }).catch(() => {
      // Autoplay blocked or network error
      this.isPlaying.set(false);
    });
  }

  /**
   * Play audio from a blob URL (e.g. for files that don't have a direct public URL).
   */
  playFromUrl(url: string, fileName: string, songName: string): void {
    const virtualFile: SongFile = {
      url,
      fileName,
      fileType: 'audio/mpeg',
      created_at: new Date().toISOString(),
    };
    this.play(virtualFile, songName);
  }

  togglePlayPause(): void {
    if (!this.audio) return;
    if (this.audio.paused) {
      this.audio.play().then(() => this.isPlaying.set(true));
    } else {
      this.audio.pause();
      this.isPlaying.set(false);
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }
    this.currentFile.set(null);
    this.currentSongName.set('');
    this.isPlaying.set(false);
    this.progress.set(0);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  /** Seek to a position. `value` is 0–100. */
  seek(value: number): void {
    if (!this.audio || !this.audio.duration) return;
    this.audio.currentTime = (value / 100) * this.audio.duration;
    this.currentTime.set(this.audio.currentTime);
    this.progress.set(value);
  }

  /** Call when user starts dragging the slider knob. */
  startSeeking(): void {
    this._isSeeking = true;
  }

  /** Call when user releases the slider knob. Seeks to the released position. */
  stopSeeking(value: number): void {
    this._isSeeking = false;
    this.seek(value);
  }

  /** Format seconds to m:ss */
  formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
