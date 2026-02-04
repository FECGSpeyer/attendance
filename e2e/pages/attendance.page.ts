/**
 * Attendance Page Object
 *
 * Handles the attendance tracking functionality -
 * the core feature of the application.
 */
import { Page, Locator, expect } from '@playwright/test';

export class AttendancePage {
  readonly page: Page;

  // Header elements
  readonly header: Locator;
  readonly dateDisplay: Locator;
  readonly addButton: Locator;

  // Attendance list
  readonly attendanceList: Locator;
  readonly attendanceItems: Locator;
  readonly emptyState: Locator;

  // Attendance detail
  readonly playerList: Locator;
  readonly playerItems: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Status buttons
  readonly presentButton: Locator;
  readonly absentButton: Locator;
  readonly excusedButton: Locator;
  readonly lateButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('ion-header');
    this.dateDisplay = page.locator('ion-title, .date-display');
    this.addButton = page.locator('ion-fab-button, ion-button:has-text("Neu")');

    // List view
    this.attendanceList = page.locator('ion-list');
    this.attendanceItems = page.locator('ion-item');
    this.emptyState = page.locator('.empty-state, ion-text:has-text("Keine")');

    // Detail view
    this.playerList = page.locator('ion-list.player-list, ion-list');
    this.playerItems = page.locator('ion-item.player-item, ion-item');
    this.saveButton = page.locator('ion-button:has-text("Speichern")');
    this.cancelButton = page.locator('ion-button:has-text("Abbrechen")');

    // Status selection - Ionic segment buttons or regular buttons
    this.presentButton = page.locator(
      'ion-segment-button[value="present"], ion-button:has-text("Anwesend")'
    );
    this.absentButton = page.locator(
      'ion-segment-button[value="absent"], ion-button:has-text("Abwesend")'
    );
    this.excusedButton = page.locator(
      'ion-segment-button[value="excused"], ion-button:has-text("Entschuldigt")'
    );
    this.lateButton = page.locator(
      'ion-segment-button[value="late"], ion-button:has-text("Verspätet")'
    );
  }

  async goto() {
    await this.page.goto('/tabs/attendance');
    await this.waitForLoad();
  }

  async waitForLoad() {
    await this.page.waitForSelector('ion-content', { state: 'visible' });
  }

  async openNewAttendance() {
    await this.addButton.click();
  }

  async selectPlayer(playerName: string) {
    const playerItem = this.page.locator(`ion-item:has-text("${playerName}")`);
    await playerItem.click();
  }

  async setPlayerStatus(
    playerName: string,
    status: 'present' | 'absent' | 'excused' | 'late'
  ) {
    const playerRow = this.page.locator(`ion-item:has-text("${playerName}")`);

    const statusButtons = {
      present: playerRow.locator('[data-status="present"], .status-present'),
      absent: playerRow.locator('[data-status="absent"], .status-absent'),
      excused: playerRow.locator('[data-status="excused"], .status-excused'),
      late: playerRow.locator('[data-status="late"], .status-late'),
    };

    await statusButtons[status].click();
  }

  async saveAttendance() {
    await this.saveButton.click();
    // Wait for save to complete
    await this.page.waitForResponse(
      (response) => response.url().includes('supabase') && response.status() === 200,
      { timeout: 10000 }
    ).catch(() => {
      // Timeout is okay - might be using local state
    });
  }

  async expectAttendanceCount(count: number) {
    await expect(this.attendanceItems).toHaveCount(count);
  }

  async openAttendanceByIndex(index: number) {
    await this.attendanceItems.nth(index).click();
  }

  async getAttendanceDate(index: number): Promise<string> {
    const item = this.attendanceItems.nth(index);
    return (await item.textContent()) || '';
  }
}
