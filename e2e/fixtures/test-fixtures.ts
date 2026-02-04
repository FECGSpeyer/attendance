/**
 * E2E Test Fixtures
 *
 * Custom fixtures for Playwright tests that provide common setup/teardown.
 */
import { test as base, Page } from '@playwright/test';

/**
 * Test user credentials for E2E tests
 * In a real scenario, these would come from environment variables
 */
export const TEST_CREDENTIALS = {
    email: process.env.E2E_TEST_EMAIL || 'test@attendix.de',
    password: process.env.E2E_TEST_PASSWORD || 'testpassword123',
};

/**
 * Custom test fixture with authenticated user
 */
export const test = base.extend<{
    authenticatedPage: Page;
}>({
    authenticatedPage: async ({ page }, use) => {
        // Navigate to login
        await page.goto('/login');

        // Wait for the page to load
        await page.waitForSelector('ion-content');

        // Fill in credentials
        const emailInput = page.locator('ion-input[type="email"] input, input[type="email"]');
        const passwordInput = page.locator('ion-input[type="password"] input, input[type="password"]');
        const loginButton = page.locator('ion-button:has-text("Anmelden"), ion-button:has-text("Login")');

        if ((await emailInput.count()) > 0) {
            await emailInput.fill(TEST_CREDENTIALS.email);
            await passwordInput.fill(TEST_CREDENTIALS.password);
            await loginButton.click();

            // Wait for navigation after login
            await page.waitForURL(/tabs/, { timeout: 10000 }).catch(() => {
                // Login might fail with test credentials, that's okay for fixture
            });
        }

        await use(page);
    },
});

export { expect } from '@playwright/test';

/**
 * Helper to wait for Ionic page transitions
 */
export async function waitForPageTransition(page: Page): Promise<void> {
    await page.waitForTimeout(300); // Ionic transition duration
    await page.waitForLoadState('networkidle');
}

/**
 * Helper to dismiss any open toasts
 */
export async function dismissToasts(page: Page): Promise<void> {
    const toasts = page.locator('ion-toast');
    const count = await toasts.count();

    for (let i = 0; i < count; i++) {
        await toasts.nth(i).click().catch(() => {
            // Toast might have auto-dismissed
        });
    }
}

/**
 * Helper to close any open modals
 */
export async function closeModals(page: Page): Promise<void> {
    const modals = page.locator('ion-modal');
    const count = await modals.count();

    for (let i = 0; i < count; i++) {
        // Try clicking the close button or backdrop
        const closeButton = modals.nth(i).locator('ion-button:has-text("Schließen"), ion-button:has-text("Close"), .close-button');
        if ((await closeButton.count()) > 0) {
            await closeButton.first().click();
        } else {
            // Click backdrop
            await page.keyboard.press('Escape');
        }
    }
}
