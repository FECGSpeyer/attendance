import { Injectable, NgZone, Signal, computed, inject, signal } from '@angular/core';

/** Ab dieser Breite ersetzt das Sidepanel im Querformat die Tabbar (Overlay-Panel). */
export const SIDE_PANEL_MIN_WIDTH = 768;
/** Ab dieser Breite steht das Sidepanel fest neben dem Inhalt (Split-Pane). */
export const SIDE_PANEL_FIXED_MIN_WIDTH = 992;
/** Ohne gespeicherte Wahl ist das feste Panel erst ab dieser Breite ausgeklappt. */
const SIDE_PANEL_EXPANDED_DEFAULT_MIN_WIDTH = 1200;
const COLLAPSED_STORAGE_KEY = 'sidePanelCollapsed';

/**
 * Hält den Navigations-Modus der App fest:
 * - Handy (< 768 px) und jedes Gerät im Hochformat (Tablet hochkant): Tabbar
 * - Querformat 768–991 px: Sidepanel als Overlay
 * - Querformat ab 992 px: festes Sidepanel, ein- oder ausgeklappt
 * Beim Drehen des Geräts wechselt der Modus automatisch (resize/orientationchange).
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private zone = inject(NgZone);

  private readonly width = signal(typeof window !== 'undefined' ? window.innerWidth : 0);
  /**
   * Gerät im Hochformat: dann bleibt es bei der Tabbar. Bewusst über die
   * Bildschirm-Ausrichtung statt über die Fenstermaße, damit die eingeblendete
   * Tastatur (macht das Fenster niedriger) nicht ins Sidepanel umschaltet.
   */
  private readonly portrait = signal(readPortrait());
  /** Sidepanel statt Tabbar (Tablet/Computer im Querformat). */
  readonly sidePanel: Signal<boolean> = computed(() => !this.portrait() && this.width() >= SIDE_PANEL_MIN_WIDTH);
  /** Sidepanel steht fest neben dem Inhalt (sonst Overlay). */
  readonly sidePanelFixed: Signal<boolean> = computed(() => this.sidePanel() && this.width() >= SIDE_PANEL_FIXED_MIN_WIDTH);

  private readonly collapsedChoice = signal<boolean | null>(this.readCollapsedChoice());
  /** Festes Panel als schmale Icon-Leiste. Im Overlay immer ausgeklappt. */
  readonly collapsed: Signal<boolean> = computed(() => {
    if (!this.sidePanelFixed()) return false;
    const choice = this.collapsedChoice();
    return choice ?? this.width() < SIDE_PANEL_EXPANDED_DEFAULT_MIN_WIDTH;
  });

  constructor() {
    if (typeof window === 'undefined') return;
    const update = () => {
      const w = window.innerWidth;
      const p = readPortrait();
      if (w !== this.width() || p !== this.portrait()) {
        this.zone.run(() => {
          this.width.set(w);
          this.portrait.set(p);
        });
      }
    };
    window.addEventListener('resize', update, { passive: true });
    screen.orientation?.addEventListener?.('change', update);
    // Manche WebViews melden die neuen Maße erst kurz nach dem Drehen.
    window.addEventListener('orientationchange', () => setTimeout(update, 250), { passive: true });
  }

  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed());
  }

  setCollapsed(value: boolean): void {
    this.collapsedChoice.set(value);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Speicher nicht verfügbar (privater Modus): Wahl gilt nur für diese Sitzung.
    }
  }

  private readCollapsedChoice(): boolean | null {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return stored === null ? null : stored === '1';
    } catch {
      return null;
    }
  }
}

/** Liest die Ausrichtung des Geräts (nicht des Fensters). */
function readPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  if (type) return type.startsWith('portrait');
  // Ältere iOS-WebViews: window.orientation 0/180 = hochkant.
  const legacy = (window as unknown as { orientation?: number }).orientation;
  if (typeof legacy === 'number') return legacy === 0 || legacy === 180;
  return window.innerHeight > window.innerWidth;
}
