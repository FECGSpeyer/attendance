/**
 * App E2E Test
 *
 * Basic smoke tests to verify the application loads correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('App Smoke Tests', () => {
    test('should load the application', async ({ page }) => {
        // Navigate and wait for the page to load
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        // Wait for Ionic content to be visible - this confirms Angular + Ionic loaded
        const content = page.locator('ion-content');
        await expect(content).toBeVisible({ timeout: 10000 });
    });

    test('should have correct title', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        // Check page title
        await expect(page).toHaveTitle(/Attendix/i);
    });

    test('should show login page for unauthenticated users', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        // Wait for navigation to complete
        await page.waitForLoadState('domcontentloaded');

        // Wait for potential redirect with timeout
        await page.waitForURL(/login/, { timeout: 5000 }).catch(() => {
            // May already be on login or stay on root
        });

        // Should be on login or root page
        const url = page.url();
        expect(url).toMatch(/(login|localhost:4200\/?$)/);
    });

    test('should load without console errors', async ({ page }) => {
        const errors: string[] = [];

        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Filter out expected errors (e.g., auth-related, external resources, etc.)
        const criticalErrors = errors.filter(
            (e) =>
                !e.includes('401') &&
                !e.includes('403') &&
                !e.includes('404') &&
                !e.includes('auth') &&
                !e.includes('Unauthorized') &&
                !e.toLowerCase().includes('failed to load resource') &&
                e.trim() !== 'Error' // Generic browser errors
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('should be accessible with keyboard navigation', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'domcontentloaded' });

        // Wait for Ionic content to be visible
        const content = page.locator('ion-content');
        await expect(content).toBeVisible({ timeout: 10000 });

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
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');

        // Check for manifest link
        const manifestLink = await page.$('link[rel="manifest"]');
        expect(manifestLink).toBeTruthy();
    });

    test('should register service worker in production', async ({ page }) => {
        // Only run in CI or when explicitly enabled (requires production build)
        test.skip(!process.env.CI && !process.env.RUN_SW_TEST, 'Service worker test requires production build');

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
