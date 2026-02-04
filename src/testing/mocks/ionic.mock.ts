/**
 * Mock Ionic Components and Services for Testing
 */
import { vi } from 'vitest';
import { EventEmitter } from '@angular/core';

/**
 * Mock Platform Service
 */
export function createPlatformMock() {
    return {
        is: vi.fn().mockReturnValue(false),
        platforms: vi.fn().mockReturnValue(['desktop', 'web']),
        ready: vi.fn().mockResolvedValue('dom'),
        isRTL: false,
        isLandscape: vi.fn().mockReturnValue(false),
        isPortrait: vi.fn().mockReturnValue(true),
        width: vi.fn().mockReturnValue(1024),
        height: vi.fn().mockReturnValue(768),
        url: vi.fn().mockReturnValue(''),
        testUserAgent: vi.fn().mockReturnValue(false),
        backButton: {
            subscribeWithPriority: vi.fn(),
        },
        keyboardDidShow: new EventEmitter(),
        keyboardDidHide: new EventEmitter(),
        pause: new EventEmitter(),
        resume: new EventEmitter(),
        resize: new EventEmitter(),
    };
}

/**
 * Mock AlertController
 */
export function createAlertControllerMock() {
    const alertMock = {
        present: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(true),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
    };

    return {
        create: vi.fn().mockResolvedValue(alertMock),
        dismiss: vi.fn().mockResolvedValue(true),
        getTop: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock ModalController
 */
export function createModalControllerMock() {
    const modalMock = {
        present: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(true),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
        onWillDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
    };

    return {
        create: vi.fn().mockResolvedValue(modalMock),
        dismiss: vi.fn().mockResolvedValue(true),
        getTop: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock ToastController
 */
export function createToastControllerMock() {
    const toastMock = {
        present: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(true),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
    };

    return {
        create: vi.fn().mockResolvedValue(toastMock),
        dismiss: vi.fn().mockResolvedValue(true),
        getTop: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock LoadingController
 */
export function createLoadingControllerMock() {
    const loadingMock = {
        present: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(true),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
    };

    return {
        create: vi.fn().mockResolvedValue(loadingMock),
        dismiss: vi.fn().mockResolvedValue(true),
        getTop: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock ActionSheetController
 */
export function createActionSheetControllerMock() {
    const actionSheetMock = {
        present: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(true),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: undefined }),
    };

    return {
        create: vi.fn().mockResolvedValue(actionSheetMock),
        dismiss: vi.fn().mockResolvedValue(true),
        getTop: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock NavController
 */
export function createNavControllerMock() {
    return {
        navigateForward: vi.fn().mockResolvedValue(true),
        navigateBack: vi.fn().mockResolvedValue(true),
        navigateRoot: vi.fn().mockResolvedValue(true),
        back: vi.fn(),
        pop: vi.fn().mockResolvedValue(true),
        setDirection: vi.fn(),
        setTopOutlet: vi.fn(),
        consumeTransition: vi.fn().mockReturnValue({ direction: 'forward', animation: undefined }),
    };
}

/**
 * Mock MenuController
 */
export function createMenuControllerMock() {
    return {
        enable: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue(true),
        close: vi.fn().mockResolvedValue(true),
        toggle: vi.fn().mockResolvedValue(true),
        isOpen: vi.fn().mockResolvedValue(false),
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(undefined),
        getMenus: vi.fn().mockResolvedValue([]),
        getOpen: vi.fn().mockResolvedValue(undefined),
        swipeGesture: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock IonRouterOutlet
 */
export function createRouterOutletMock() {
    return {
        canGoBack: vi.fn().mockReturnValue(false),
        pop: vi.fn().mockResolvedValue(true),
    };
}
