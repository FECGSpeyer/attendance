/**
 * Players Page Object
 *
 * Handles the player/member management functionality.
 */
import { Page, Locator, expect } from '@playwright/test';

export class PlayersPage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly searchInput: Locator;
  readonly addButton: Locator;
  readonly filterButton: Locator;

  // List
  readonly playerList: Locator;
  readonly playerItems: Locator;
  readonly emptyState: Locator;

  // Filters
  readonly filterModal: Locator;
  readonly groupFilter: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('ion-header');
    this.searchInput = page.locator('ion-searchbar input, input[type="search"]');
    this.addButton = page.locator('ion-fab-button, ion-button:has-text("Neu")');
    this.filterButton = page.locator('ion-button:has(ion-icon[name="filter"])');

    // List
    this.playerList = page.locator('ion-list');
    this.playerItems = page.locator('ion-item.player-item, ion-item');
    this.emptyState = page.locator('.empty-state, ion-text:has-text("Keine")');

    // Filters
    this.filterModal = page.locator('ion-modal, ion-popover');
    this.groupFilter = page.locator('ion-select[formcontrolname="group"]');
    this.statusFilter = page.locator('ion-segment');
  }

  async goto() {
    await this.page.goto('/tabs/players');
    await this.waitForLoad();
  }

  async waitForLoad() {
    await this.page.waitForSelector('ion-content', { state: 'visible' });
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for filter to apply
    await this.page.waitForTimeout(300);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async openPlayer(playerName: string) {
    const playerItem = this.page.locator(`ion-item:has-text("${playerName}")`);
    await playerItem.click();
  }

  async openPlayerByIndex(index: number) {
    await this.playerItems.nth(index).click();
  }

  async openAddPlayer() {
    await this.addButton.click();
  }

  async expectPlayerCount(count: number) {
    await expect(this.playerItems).toHaveCount(count);
  }

  async expectPlayerVisible(playerName: string) {
    const playerItem = this.page.locator(`ion-item:has-text("${playerName}")`);
    await expect(playerItem).toBeVisible();
  }

  async expectPlayerNotVisible(playerName: string) {
    const playerItem = this.page.locator(`ion-item:has-text("${playerName}")`);
    await expect(playerItem).not.toBeVisible();
  }

  async getPlayerNames(): Promise<string[]> {
    const items = await this.playerItems.all();
    const names: string[] = [];
    for (const item of items) {
      const text = await item.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }
}
