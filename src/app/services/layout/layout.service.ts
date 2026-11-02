import { Injectable, NgZone, Signal, computed, inject, signal } from '@angular/core';

/** Ab dieser Breite ersetzt das Sidepanel die Tabbar (Overlay-Panel). */
export const SIDE_PANEL_MIN_WIDTH = 768;
/** Ab dieser Breite steht das Sidepanel fest neben dem Inhalt (Split-Pane). */
export const SIDE_PANEL_FIXED_MIN_WIDTH = 992;
/** Ohne gespeicherte Wahl ist das feste Panel erst ab dieser Breite ausgeklappt. */
const SIDE_PANEL_EXPANDED_DEFAULT_MIN_WIDTH = 1200;
const COLLAPSED_STORAGE_KEY = 'sidePanelCollapsed';

/**
 * Hält den Navigations-Modus der App fest:
 * - Handy (< 768 px): Tabbar
 * - Tablet hochkant (768–991 px): Sidepanel als Overlay
 * - ab 992 px: festes Sidepanel, ein- oder ausgeklappt
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private zone = inject(NgZone);

  private readonly width = signal(typeof window !== 'undefined' ? window.innerWidth : 0);

  /** Sidepanel statt Tabbar (Tablet und größer). */
  readonly sidePanel: Signal<boolean> = computed(() => this.width() >= SIDE_PANEL_MIN_WIDTH);
  /** Sidepanel steht fest neben dem Inhalt (sonst Overlay). */
  readonly sidePanelFixed: Signal<boolean> = computed(() => this.width() >= SIDE_PANEL_FIXED_MIN_WIDTH);

  private readonly collapsedChoice = signal<boolean | null>(this.readCollapsedChoice());
  /** Festes Panel als schmale Icon-Leiste. Im Overlay immer ausgeklappt. */
  readonly collapsed: Signal<boolean> = computed(() => {
    if (!this.sidePanelFixed()) return false;
    const choice = this.collapsedChoice();
    return choice ?? this.width() < SIDE_PANEL_EXPANDED_DEFAULT_MIN_WIDTH;
  });

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      if (w !== this.width()) {
        this.zone.run(() => this.width.set(w));
      }
    }, { passive: true });
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
