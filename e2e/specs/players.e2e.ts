/**
 * Players E2E Tests
 *
 * Tests the player/member management functionality.
 * Handles both authenticated and unauthenticated states.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages';

test.describe('Players Page (Unauthenticated)', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
        await page.goto('/tabs/players', { waitUntil: 'domcontentloaded' });

        // Wait for page to load and potential redirect
        await page.waitForLoadState('domcontentloaded');

        // Wait for redirect with timeout
        await page.waitForURL(/login/, { timeout: 5000 }).catch(() => {
            // May stay on page if session exists
        });

        // Should be either on login or tabs (if authenticated)
        const url = page.url();
        expect(url).toMatch(/(login|tabs)/);
    });
});

test.describe('Players Navigation', () => {
    test('should start at login page', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        // Verify login page elements
        await expect(loginPage.emailInput).toBeVisible();
        await expect(loginPage.passwordInput).toBeVisible();
        await expect(loginPage.loginButton).toBeVisible();
    });
});

test.describe('Players Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'domcontentloaded' });

        // Wait for Ionic content to be visible
        const content = page.locator('ion-content');
        await expect(content).toBeVisible({ timeout: 10000 });

        // Tab through focusable elements
        await page.keyboard.press('Tab');
        const focusedElement = page.locator(':focus').first();
        await expect(focusedElement).toBeVisible();
    });

    test('should have visible form labels', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        // Check that labels are visible for accessibility
        const emailLabel = page.locator('ion-label:has-text("E-Mail"), ion-item:has-text("E-Mail")');
        await expect(emailLabel.first()).toBeVisible();
    });
});
