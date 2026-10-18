import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { Utils } from 'src/app/utilities/Utils';

export type MediaSessionActionName = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto' | 'stop';
export type MediaSessionPlayback = 'none' | 'paused' | 'playing';

type Artwork = { src: string; sizes?: string; type?: string }[];

/** The app icon; the file is PNG data despite its .webp name. 256 px is plenty for the lock screen. */
const LOGO_URL = 'assets/icons/icon-256.webp';
/** The same icon from the web app, for iOS, where WebKit gets a plain https cover (see webArtwork). */
const LOGO_WEB_URL = 'https://attendix.de/assets/icons/icon-256.webp';

/**
 * Lock-screen / notification controls for the audio player.
 *
 * Android uses the native @capgo/capacitor-media-session plugin (foreground
 * service + media notification). App shells built before the plugin was added
 * don't have it, so we check `isPluginAvailable` and fall back to the browser
 * Media Session API — the same API that iOS (WKWebView) and the web use.
 * iOS can't use the plugin: WebKit owns Now Playing for the <audio> element
 * and overwrites whatever the plugin sets (tested on a device, 4.14.11).
 * All calls are best-effort and never throw.
 */
export class MediaSessionBridge {
  private readonly useNativePlugin =
    Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MediaSession');

  constructor() {
    if (this.useNativePlugin) {
      // Preload so the first track already gets the cover in one metadata update.
      MediaSessionBridge.loadArtwork(LOGO_URL);
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

  /** Loaded once per image and shared by all players. */
  private static artworkCache = new Map<string, Promise<Artwork | undefined>>();
  private static artworkLoaded = new Map<string, Artwork>();
  /** Bumped on every metadata change so a late cover load can't overwrite a newer track. */
  private metadataVersion = 0;

  /**
   * Shows the track with a cover: the tenant's branding logo when given,
   * otherwise the Attendix logo (there is no per-track artwork).
   */
  setMetadata(title: string, artist: string, coverUrl?: string): void {
    const version = ++this.metadataVersion;
    if (!this.useNativePlugin) {
      this.applyMetadata(title, artist, MediaSessionBridge.webArtwork(coverUrl));
      return;
    }
    const src = coverUrl || LOGO_URL;
    const loaded = MediaSessionBridge.artworkLoaded;
    this.applyMetadata(title, artist, loaded.get(src) ?? loaded.get(LOGO_URL));
    if (!loaded.has(src)) {
      MediaSessionBridge.loadArtwork(src)
        .then(artwork => artwork ?? (src !== LOGO_URL ? MediaSessionBridge.loadArtwork(LOGO_URL) : undefined))
        .then(artwork => {
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
   * Browsers load the cover themselves. The iOS app gets the logo from the web
   * app over https: in the iOS 27 simulator the lock screen dropped the whole
   * Now Playing panel for data and app-asset URLs.
   */
  private static webArtwork(coverUrl?: string): Artwork | undefined {
    if (coverUrl) {
      return [{ src: coverUrl }];
    }
    if (Capacitor.getPlatform() === 'ios') {
      return [{ src: LOGO_WEB_URL, sizes: '256x256', type: 'image/png' }];
    }
    try {
      return [{ src: new URL(LOGO_URL, document.baseURI).href, sizes: '256x256', type: 'image/png' }];
    } catch {
      return undefined;
    }
  }

  /**
   * The cover as a data URL for the Android plugin, which can't load blob: URLs
   * or the WebView's https://localhost origin from native code.
   */
  private static loadArtwork(src: string): Promise<Artwork | undefined> {
    const cache = MediaSessionBridge.artworkCache;
    if (!cache.has(src)) {
      cache.set(src, fetch(src)
        .then(res => (res.ok ? res.blob() : Promise.reject(new Error(res.statusText))))
        .then(blob => (src === LOGO_URL ? MediaSessionBridge.blobArtwork(blob) : MediaSessionBridge.squareArtwork(blob)))
        .then(artwork => {
          MediaSessionBridge.artworkLoaded.set(src, artwork);
          return artwork;
        })
        .catch(() => {
          // Retry on the next track instead of caching the failure.
          cache.delete(src);
          return undefined;
        }));
    }
    return cache.get(src);
  }

  private static async blobArtwork(blob: Blob): Promise<Artwork> {
    const base64 = await Utils.blobToBase64(blob);
    return [{ src: `data:${blob.type || 'image/png'};base64,${base64}`, sizes: '256x256', type: blob.type || 'image/png' }];
  }

  /**
   * Branding logos come in any shape and may be transparent. The notification
   * crops covers to a square, so the logo is centered on a white square.
   */
  private static async squareArtwork(blob: Blob): Promise<Artwork> {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to decode cover'));
        image.src = objectUrl;
      });
      const size = 512;
      const inner = size * 0.84;
      const scale = Math.min(inner / img.naturalWidth, inner / img.naturalHeight);
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx || !width || !height) {
        return MediaSessionBridge.blobArtwork(blob);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
      return [{ src: canvas.toDataURL('image/png'), sizes: `${size}x${size}`, type: 'image/png' }];
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
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
