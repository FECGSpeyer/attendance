/**
 * Login Page Object
 *
 * Encapsulates all interactions with the login page.
 * This makes tests more maintainable - if selectors change,
 * only this file needs to be updated.
 */
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  // Locators
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;
  readonly errorMessage: Locator;
  readonly loadingSpinner: Locator;
  readonly content: Locator;

  constructor(page: Page) {
    this.page = page;

    // Based on actual login.page.html structure:
    // - ion-input with name="email" for email
    // - ion-input with name="password" for password
    // Ionic wraps input elements, so we target the inner input or the ion-input directly
    this.emailInput = page.locator('ion-input[name="email"]');
    this.passwordInput = page.locator('ion-input[name="password"]');
    this.loginButton = page.locator('ion-button:has-text("Anmelden")');
    this.forgotPasswordLink = page.locator('ion-button:has-text("Passwort vergessen")');
    this.registerLink = page.locator('ion-button:has-text("Registrieren")');
    this.errorMessage = page.locator('.error-message, ion-text[color="danger"], ion-toast');
    this.loadingSpinner = page.locator('ion-loading, ion-spinner');
    this.content = page.locator('ion-content');
  }

  async goto() {
    // Use 'domcontentloaded' for faster page loads, especially on mobile
    await this.page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    // Wait for Ionic content to be visible with a reasonable timeout
    await this.content.waitFor({ state: 'visible', timeout: 10000 });
    // Wait for form elements to appear
    await this.emailInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectLoginSuccess() {
    // After successful login, should redirect to tabs
    await expect(this.page).toHaveURL(/tabs/, { timeout: 10000 });
  }

  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 5000 });
  }

  async clickForgotPassword() {
    await this.forgotPasswordLink.click();
  }

  async clickRegister() {
    await this.registerLink.click();
  }
}
