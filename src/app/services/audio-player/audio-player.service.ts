import { computed, Injectable, signal, WritableSignal } from '@angular/core';
import { SongFile } from 'src/app/utilities/interfaces';

/** An entry of a playback queue. The URL is resolved lazily (e.g. signed storage URLs). */
export interface AudioQueueItem {
  fileName: string;
  title: string;
  resolveUrl: () => Promise<string>;
}

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

  /** Playback queue (empty when a single file is played) */
  public queue: WritableSignal<AudioQueueItem[]> = signal([]);
  public queueIndex: WritableSignal<number> = signal(-1);
  public hasQueue = computed(() => this.queue().length > 1);
  public hasNext = computed(() => this.queueIndex() < this.queue().length - 1);
  public hasPrevious = computed(() => this.queueIndex() > 0);

  private audio: HTMLAudioElement | null = null;
  private _isSeeking = false;
  /** Incremented on every track change to ignore stale async URL resolutions */
  private loadToken = 0;

  /** Audio file extensions recognised as playable */
  private static readonly AUDIO_EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.webm', '.opus',
  ];

  /** Seconds after which "previous" restarts the current track instead of skipping back */
  private static readonly RESTART_THRESHOLD = 3;

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

  /** Start playing a file. Stops any previous playback and clears the queue. */
  play(file: SongFile, songName: string): void {
    this.clearQueue();
    this.loadToken++;
    this.startPlayback(file, songName);
  }

  /**
   * Play audio from a blob URL (e.g. for files that don't have a direct public URL).
   */
  playFromUrl(url: string, fileName: string, songName: string): void {
    this.play(this.createVirtualFile(url, fileName), songName);
  }

  /** Play a list of audio files, starting at `startIndex`. Advances automatically when a track ends. */
  async playQueue(items: AudioQueueItem[], startIndex = 0): Promise<void> {
    this.queue.set(items);
    await this.playQueueItem(startIndex);
  }

  async next(): Promise<void> {
    if (!this.hasNext()) {return;}
    await this.playQueueItem(this.queueIndex() + 1);
  }

  async previous(): Promise<void> {
    if (this.audio && this.audio.currentTime > AudioPlayerService.RESTART_THRESHOLD) {
      this.seek(0);
      return;
    }
    if (!this.hasPrevious()) {
      this.seek(0);
      return;
    }
    await this.playQueueItem(this.queueIndex() - 1);
  }

  togglePlayPause(): void {
    if (!this.audio || !this.currentFile()) {return;}
    if (this.audio.paused) {
      this.audio.play().then(() => this.isPlaying.set(true));
    } else {
      this.audio.pause();
      this.isPlaying.set(false);
    }
  }

  stop(): void {
    this.loadToken++;
    this.clearQueue();
    this.resetPlayback();
  }

  /** Seek to a position. `value` is 0–100. */
  seek(value: number): void {
    if (!this.audio || !this.audio.duration) {return;}
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
    if (!seconds || !isFinite(seconds)) {return '0:00';}
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private async playQueueItem(index: number): Promise<void> {
    const item = this.queue()[index];
    if (!item) {return;}

    const token = ++this.loadToken;
    this.queueIndex.set(index);
    this.audio?.pause();

    let url: string;
    try {
      url = await item.resolveUrl();
    } catch (error) {
      if (token === this.loadToken) {
        this.resetPlayback();
      }
      throw error;
    }

    if (token !== this.loadToken) {return;}
    this.startPlayback(this.createVirtualFile(url, item.fileName), item.title);
  }

  private onEnded(): void {
    if (this.hasNext()) {
      this.next().catch(() => this.resetPlayback());
      return;
    }
    this.isPlaying.set(false);
    this.progress.set(0);
    this.currentTime.set(0);
  }

  /** Lazily create a single audio element that is reused for all tracks (keeps autoplay working on iOS). */
  private getAudio(): HTMLAudioElement {
    if (this.audio) {return this.audio;}

    const audio = new Audio();

    audio.addEventListener('loadedmetadata', () => {
      this.duration.set(audio.duration ?? 0);
    });

    audio.addEventListener('timeupdate', () => {
      if (this._isSeeking || !this.currentFile()) {return;}
      this.currentTime.set(audio.currentTime);
      const dur = audio.duration;
      this.progress.set(dur > 0 ? (audio.currentTime / dur) * 100 : 0);
    });

    audio.addEventListener('ended', () => this.onEnded());

    this.audio = audio;
    return audio;
  }

  private startPlayback(file: SongFile, songName: string): void {
    const audio = this.getAudio();
    audio.pause();
    audio.src = file.url;

    this.currentFile.set(file);
    this.currentSongName.set(songName);
    this.progress.set(0);
    this.currentTime.set(0);
    this.duration.set(0);

    audio.play().then(() => {
      this.isPlaying.set(true);
    }).catch(() => {
      // Autoplay blocked or network error
      this.isPlaying.set(false);
    });
  }

  private resetPlayback(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.currentFile.set(null);
    this.currentSongName.set('');
    this.isPlaying.set(false);
    this.progress.set(0);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  private clearQueue(): void {
    this.queue.set([]);
    this.queueIndex.set(-1);
  }

  private createVirtualFile(url: string, fileName: string): SongFile {
    return {
      url,
      fileName,
      fileType: 'audio/mpeg',
      created_at: new Date().toISOString(),
    };
  }
}
