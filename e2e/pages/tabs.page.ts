/**
 * Tabs Page Object
 *
 * The main navigation hub after login.
 * Provides access to all main sections of the app.
 */
import { Page, Locator, expect } from '@playwright/test';

export class TabsPage {
    readonly page: Page;

    // Tab buttons
    readonly attendanceTab: Locator;
    readonly playersTab: Locator;
    readonly statsTab: Locator;
    readonly settingsTab: Locator;

    // Common elements
    readonly header: Locator;
    readonly content: Locator;
    readonly menuButton: Locator;

    constructor(page: Page) {
        this.page = page;

        // Ionic tab bar buttons
        this.attendanceTab = page.locator('ion-tab-button[tab="attendance"], ion-tab-button:has-text("Anwesenheit")');
        this.playersTab = page.locator('ion-tab-button[tab="players"], ion-tab-button:has-text("Spieler"), ion-tab-button:has-text("Mitglieder")');
        this.statsTab = page.locator('ion-tab-button[tab="stats"], ion-tab-button:has-text("Statistik")');
        this.settingsTab = page.locator('ion-tab-button[tab="settings"], ion-tab-button:has-text("Einstellungen")');

        this.header = page.locator('ion-header');
        this.content = page.locator('ion-content');
        this.menuButton = page.locator('ion-menu-button, ion-buttons ion-button');
    }

    async goto() {
        await this.page.goto('/tabs');
        await this.waitForLoad();
    }

    async waitForLoad() {
        await this.page.waitForSelector('ion-tab-bar', { state: 'visible' });
    }

    async navigateToAttendance() {
        await this.attendanceTab.click();
        await this.page.waitForURL(/tabs\/attendance/);
    }

    async navigateToPlayers() {
        await this.playersTab.click();
        await this.page.waitForURL(/tabs\/players/);
    }

    async navigateToStats() {
        await this.statsTab.click();
        await this.page.waitForURL(/tabs\/stats/);
    }

    async navigateToSettings() {
        await this.settingsTab.click();
        await this.page.waitForURL(/tabs\/settings/);
    }

    async expectTabVisible(tabName: 'attendance' | 'players' | 'stats' | 'settings') {
        const tabLocators = {
            attendance: this.attendanceTab,
            players: this.playersTab,
            stats: this.statsTab,
            settings: this.settingsTab,
        };
        await expect(tabLocators[tabName]).toBeVisible();
    }
}
