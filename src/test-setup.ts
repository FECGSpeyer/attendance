import '@analogjs/vite-plugin-angular/setup-vitest';

import {
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { provideTransloco, TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { firstValueFrom, of } from 'rxjs';
import de from './i18n/de.json';

// Suppress unhandled promise rejections during test cleanup
// These often occur when async operations (like Supabase subscriptions)
// are still pending when the test environment is torn down
const originalUnhandledRejection = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason: any) => {
    // Ignore common test cleanup errors
    const message = reason?.message || String(reason);
    if (
        message.includes('Cannot read properties of undefined') ||
        message.includes('The operation was aborted') ||
        message.includes('unsubscribe')
    ) {
        // Silently ignore these cleanup-related errors
        return;
    }
    // Re-throw other unhandled rejections
    console.error('Unhandled Rejection:', reason);
});

// Mock window.matchMedia for Ionic components
Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { /* noop */ },
        removeListener: () => { /* noop */ },
        addEventListener: () => { /* noop */ },
        removeEventListener: () => { /* noop */ },
        dispatchEvent: () => false,
    }),
});

// Mock ResizeObserver for Ionic components
(globalThis as any).ResizeObserver = class ResizeObserverMock {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
};

// Mock IntersectionObserver for Ionic components
(globalThis as any).IntersectionObserver = class IntersectionObserverMock {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
};

getTestBed().initTestEnvironment(
    [
        BrowserDynamicTestingModule,
        // Real German texts in every test, so `translate()` and the
        // transloco pipe work like in the app.
        TranslocoTestingModule.forRoot({
            langs: { de },
            translocoConfig: { availableLangs: ['de'], defaultLang: 'de' },
            preloadLangs: true,
        }),
    ],
    platformBrowserDynamicTesting()
);

// Plain unit tests (no TestBed) call the global `translate()` too, e.g. in
// Utils. Give them a TranslocoService with the German texts up front.
const translocoInjector = createEnvironmentInjector(
    [
        provideTransloco({
            config: { availableLangs: ['de'], defaultLang: 'de', fallbackLang: 'de' },
            loader: class { getTranslation() { return of(de); } },
        }),
        provideTranslocoMessageformat(),
        TranslocoService,
    ],
    getTestBed().platform.injector as EnvironmentInjector,
);
await firstValueFrom(translocoInjector.get(TranslocoService).load('de'));

