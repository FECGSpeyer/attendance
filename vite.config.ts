/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [
        angular(),
    ],
    resolve: {
        alias: {
            'src': resolve(__dirname, './src'),
        },
        // Ensure proper resolution of node modules
        mainFields: ['module', 'main'],
    },
    optimizeDeps: {
        include: ['@ionic/angular', '@ionic/core'],
        esbuildOptions: {
            // Node.js global to browser globalThis
            define: {
                global: 'globalThis',
            },
        },
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['src/test-setup.ts'],
        include: ['src/**/*.spec.ts'],
        exclude: ['e2e/**/*'],
        reporters: ['default'],
        server: {
            deps: {
                inline: ['@ionic/angular', '@ionic/core', '@angular'],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/app/**/*.ts'],
            exclude: [
                'src/app/**/*.spec.ts',
                'src/app/**/*.module.ts',
                'src/app/**/index.ts',
                'src/app/**/*.routes.ts',
            ],
            thresholds: {
                // Phase 1: Realistische Startwerte
                statements: 20,
                branches: 15,
                functions: 20,
                lines: 20,
            },
        },
    },
    define: {
        'import.meta.vitest': 'undefined',
    },
});
