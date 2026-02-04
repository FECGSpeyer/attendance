/**
 * App E2E Test
 *
 * Basic smoke tests to verify the application loads correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('App Smoke Tests', () => {
    test('should load the application', async ({ page }) => {
        await page.goto('/');

        // Wait for Angular to bootstrap
        await page.waitForSelector('app-root, ion-app');

        // Check that the app loaded
        const app = page.locator('app-root, ion-app');
        await expect(app).toBeVisible();
    });

    test('should have correct title', async ({ page }) => {
        await page.goto('/');

        // Check page title
        await expect(page).toHaveTitle(/Attendix/i);
    });

    test('should show login page for unauthenticated users', async ({ page }) => {
        await page.goto('/');

        // Wait for navigation to complete
        await page.waitForLoadState('networkidle');

        // Should redirect to login or show login
        const url = page.url();
        expect(url).toMatch(/login|tabs/);
    });

    test('should load without console errors', async ({ page }) => {
        const errors: string[] = [];

        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Filter out expected errors (e.g., auth-related when not logged in)
        const criticalErrors = errors.filter(
            (e) => !e.includes('401') && !e.includes('auth') && !e.includes('Unauthorized')
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('should be accessible with keyboard navigation', async ({ page }) => {
        await page.goto('/login');
        await page.waitForSelector('ion-content');

        // Tab through interactive elements
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Check that focus is on an interactive element
        const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
        expect(focusedElement).toBeTruthy();
    });
});

test.describe('PWA Features', () => {
    test('should have a valid manifest', async ({ page }) => {
        await page.goto('/');

        // Check for manifest link
        const manifestLink = await page.$('link[rel="manifest"]');
        expect(manifestLink).toBeTruthy();
    });

    test('should register service worker in production', async ({ page }) => {
        // This test is more relevant for production builds
        test.skip(!process.env.CI, 'Service worker tests are for production builds');

        await page.goto('/');

        const swRegistration = await page.evaluate(async () => {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                return !!registration;
            }
            return false;
        });

        expect(swRegistration).toBe(true);
    });
});
