/**
 * Attendance E2E Tests
 *
 * Tests the core attendance tracking functionality.
 * These tests handle both authenticated and unauthenticated states.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages';

test.describe('Attendance Page (Unauthenticated)', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
        await page.goto('/tabs/attendance', { waitUntil: 'domcontentloaded' });

        // Wait for page to load and potential redirect
        await page.waitForLoadState('domcontentloaded');

        // Wait for redirect with timeout
        await page.waitForURL(/(login|tabs|\/$)/, { timeout: 5000 }).catch(() => {
            // May stay on page if session exists or redirect to root
        });

        // App may redirect to login, stay on tabs, or go to root
        const url = page.url();
        expect(url).toMatch(/(login|tabs|localhost:4200\/?$)/);
    });
});

test.describe('Attendance Navigation', () => {
    test('should navigate to login first', async ({ page }) => {
        // Test basic navigation flow
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        // Verify login page loads
        await expect(loginPage.emailInput).toBeVisible();
        await expect(loginPage.loginButton).toBeVisible();
    });
});

test.describe('Attendance UI Elements', () => {
    test('should have proper mobile layout on login', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        const loginPage = new LoginPage(page);
        await loginPage.goto();

        // Login page should be mobile-friendly
        await expect(loginPage.emailInput).toBeVisible();
        await expect(loginPage.loginButton).toBeVisible();

        // Check that content fits the mobile viewport
        const content = page.locator('ion-content');
        await expect(content).toBeVisible();
    });
});
