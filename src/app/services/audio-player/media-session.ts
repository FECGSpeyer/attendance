import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { Utils } from 'src/app/utilities/Utils';

export type MediaSessionActionName = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto' | 'stop';
export type MediaSessionPlayback = 'none' | 'paused' | 'playing';

type Artwork = { src: string; sizes: string; type: string }[];

/** The app icon; the file is PNG data despite its .webp name. 256 px is plenty for the lock screen. */
const LOGO_URL = 'assets/icons/icon-256.webp';

/**
 * Lock-screen / notification controls for the audio player.
 *
 * Android uses the native @capgo/capacitor-media-session plugin (foreground
 * service + media notification). App shells built before the plugin was added
 * don't have it, so we check `isPluginAvailable` and fall back to the browser
 * Media Session API — the same API that iOS (WKWebView) and the web use.
 * All calls are best-effort and never throw.
 */
export class MediaSessionBridge {
  private readonly useNativePlugin =
    Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MediaSession');

  constructor() {
    if (this.useNativePlugin) {
      // Preload so the first track already gets the cover in one metadata update.
      MediaSessionBridge.loadLogoArtwork();
    }
  }

  private get webSession(): MediaSession | undefined {
    return typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  }

  get isSupported(): boolean {
    return this.useNativePlugin || !!this.webSession;
  }

  setActionHandler(action: MediaSessionActionName, handler: (seekTime?: number) => void): void {
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setActionHandler({ action }, details => handler(details?.seekTime ?? undefined)));
      return;
    }
    this.run(() => this.webSession?.setActionHandler(action, details => handler(details?.seekTime ?? undefined)));
  }

  /** Loaded once and shared by all players. */
  private static logoArtwork: Promise<Artwork | undefined> | undefined;
  private static logoArtworkLoaded: Artwork | undefined;
  /** Bumped on every metadata change so a late logo load can't overwrite a newer track. */
  private metadataVersion = 0;

  /** Shows the track with the Attendix logo as cover (there is no per-track artwork). */
  setMetadata(title: string, artist: string): void {
    const version = ++this.metadataVersion;
    if (!this.useNativePlugin) {
      this.applyMetadata(title, artist, MediaSessionBridge.webLogoArtwork());
      return;
    }
    this.applyMetadata(title, artist, MediaSessionBridge.logoArtworkLoaded);
    if (!MediaSessionBridge.logoArtworkLoaded) {
      MediaSessionBridge.loadLogoArtwork().then(artwork => {
        if (artwork && version === this.metadataVersion) {
          this.applyMetadata(title, artist, artwork);
        }
      });
    }
  }

  private applyMetadata(title: string, artist: string, artwork?: Artwork): void {
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setMetadata({ title, artist, ...(artwork ? { artwork } : {}) }));
      return;
    }
    this.run(() => {
      const session = this.webSession;
      if (session && typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({ title, artist, ...(artwork ? { artwork } : {}) });
      }
    });
  }

  /**
   * Browsers load the cover themselves from the app's own assets. Not in the iOS
   * app: on iOS 27 the lock screen drops the whole Now Playing panel as soon as
   * WKWebView passes any artwork (data or asset URL, seen in the simulator).
   */
  private static webLogoArtwork(): Artwork | undefined {
    if (Capacitor.getPlatform() === 'ios') { return undefined; }
    try {
      return [{ src: new URL(LOGO_URL, document.baseURI).href, sizes: '256x256', type: 'image/png' }];
    } catch {
      return undefined;
    }
  }

  /**
   * The logo as a data URL for the Android plugin, which can't load blob: URLs
   * or the WebView's https://localhost origin from native code.
   */
  private static loadLogoArtwork(): Promise<Artwork | undefined> {
    MediaSessionBridge.logoArtwork ??= fetch(LOGO_URL)
      .then(res => (res.ok ? res.blob() : Promise.reject(new Error(res.statusText))))
      .then(blob => Utils.blobToBase64(blob))
      .then(base64 => {
        const artwork = [{ src: `data:image/png;base64,${base64}`, sizes: '256x256', type: 'image/png' }];
        MediaSessionBridge.logoArtworkLoaded = artwork;
        return artwork;
      })
      .catch(() => {
        // Retry on the next track instead of caching the failure.
        MediaSessionBridge.logoArtwork = undefined;
        return undefined;
      });
    return MediaSessionBridge.logoArtwork;
  }

  clearMetadata(): void {
    this.metadataVersion++;
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setMetadata({ title: '', artist: '' }));
      return;
    }
    this.run(() => {
      if (this.webSession) {
        this.webSession.metadata = null;
      }
    });
  }

  setPlaybackState(playbackState: MediaSessionPlayback): void {
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setPlaybackState({ playbackState }));
      return;
    }
    this.run(() => {
      if (this.webSession) {
        this.webSession.playbackState = playbackState;
      }
    });
  }

  setPositionState(duration: number, position: number): void {
    if (!isFinite(duration) || duration <= 0) {return;}
    const state = { duration, position: Math.min(Math.max(position, 0), duration), playbackRate: 1 };
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setPositionState(state));
      return;
    }
    this.run(() => this.webSession?.setPositionState?.(state));
  }

  /** Swallow sync errors and rejected promises: unsupported actions must not break playback. */
  private run(fn: () => unknown): void {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }
}
