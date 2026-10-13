import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';

export type MediaSessionActionName = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto' | 'stop';
export type MediaSessionPlayback = 'none' | 'paused' | 'playing';

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

  setMetadata(title: string, artist: string): void {
    if (this.useNativePlugin) {
      this.run(() => MediaSession.setMetadata({ title, artist }));
      return;
    }
    this.run(() => {
      const session = this.webSession;
      if (session && typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({ title, artist });
      }
    });
  }

  clearMetadata(): void {
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
