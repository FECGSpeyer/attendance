/**
 * Mock Capacitor Plugins for Testing
 * Capacitor APIs throw errors in non-native environments (web/PWA)
 * These mocks simulate successful calls for testing
 */
import { vi } from 'vitest';

/**
 * Mock Haptics Plugin
 */
export const HapticsMock = {
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined),
    vibrate: vi.fn().mockResolvedValue(undefined),
    selectionStart: vi.fn().mockResolvedValue(undefined),
    selectionChanged: vi.fn().mockResolvedValue(undefined),
    selectionEnd: vi.fn().mockResolvedValue(undefined),
};

/**
 * Mock Network Plugin
 */
export const NetworkMock = {
    getStatus: vi.fn().mockResolvedValue({ connected: true, connectionType: 'wifi' }),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
};

/**
 * Mock App Plugin
 */
export const AppMock = {
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    getInfo: vi.fn().mockResolvedValue({ name: 'Attendix', id: 'de.attendix.app', build: '1', version: '1.0.0' }),
    getState: vi.fn().mockResolvedValue({ isActive: true }),
    exitApp: vi.fn(),
    minimizeApp: vi.fn(),
};

/**
 * Mock Browser Plugin
 */
export const BrowserMock = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
};

/**
 * Mock Keyboard Plugin
 */
export const KeyboardMock = {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    setAccessoryBarVisible: vi.fn().mockResolvedValue(undefined),
    setScroll: vi.fn().mockResolvedValue(undefined),
    setStyle: vi.fn().mockResolvedValue(undefined),
    setResizeMode: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
};

/**
 * Mock StatusBar Plugin
 */
export const StatusBarMock = {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    getInfo: vi.fn().mockResolvedValue({ visible: true, style: 'DARK' }),
    setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
};

/**
 * Setup all Capacitor mocks globally
 * Call this in your test setup if you need all mocks
 */
export function setupCapacitorMocks() {
    vi.mock('@capacitor/haptics', () => ({ Haptics: HapticsMock }));
    vi.mock('@capacitor/network', () => ({ Network: NetworkMock }));
    vi.mock('@capacitor/app', () => ({ App: AppMock }));
    vi.mock('@capacitor/browser', () => ({ Browser: BrowserMock }));
    vi.mock('@capacitor/keyboard', () => ({ Keyboard: KeyboardMock }));
    vi.mock('@capacitor/status-bar', () => ({ StatusBar: StatusBarMock }));
}

/**
 * Reset all Capacitor mocks
 */
export function resetCapacitorMocks() {
    Object.values(HapticsMock).forEach((fn) => fn.mockClear());
    Object.values(NetworkMock).forEach((fn) => typeof fn === 'function' && fn.mockClear?.());
    Object.values(AppMock).forEach((fn) => typeof fn === 'function' && fn.mockClear?.());
    Object.values(BrowserMock).forEach((fn) => typeof fn === 'function' && fn.mockClear?.());
    Object.values(KeyboardMock).forEach((fn) => typeof fn === 'function' && fn.mockClear?.());
    Object.values(StatusBarMock).forEach((fn) => typeof fn === 'function' && fn.mockClear?.());
}
