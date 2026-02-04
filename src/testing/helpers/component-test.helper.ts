/**
 * Component Test Helpers for Angular/Ionic Components
 */
import { ComponentFixture, TestBed, TestModuleMetadata } from '@angular/core/testing';
import { Type } from '@angular/core';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular';
import { DbService } from '../../app/services/db.service';
import { createDbServiceMock, DbServiceMockOptions } from '../mocks/db-service.mock';
import {
    createAlertControllerMock,
    createModalControllerMock,
    createToastControllerMock,
    createLoadingControllerMock,
    createPlatformMock,
    createNavControllerMock,
} from '../mocks/ionic.mock';
import {
    AlertController,
    ModalController,
    ToastController,
    LoadingController,
    Platform,
    NavController,
} from '@ionic/angular';

export interface ComponentTestConfig<T> extends Partial<TestModuleMetadata> {
    component: Type<T>;
    dbServiceOptions?: DbServiceMockOptions;
    /** Additional providers beyond the defaults */
    additionalProviders?: any[];
    /** If true, uses NO_ERRORS_SCHEMA instead of CUSTOM_ELEMENTS_SCHEMA */
    strictSchema?: boolean;
}

export interface ComponentTestContext<T> {
    fixture: ComponentFixture<T>;
    component: T;
    dbServiceMock: ReturnType<typeof createDbServiceMock>;
    alertControllerMock: ReturnType<typeof createAlertControllerMock>;
    modalControllerMock: ReturnType<typeof createModalControllerMock>;
    toastControllerMock: ReturnType<typeof createToastControllerMock>;
    loadingControllerMock: ReturnType<typeof createLoadingControllerMock>;
    platformMock: ReturnType<typeof createPlatformMock>;
    navControllerMock: ReturnType<typeof createNavControllerMock>;
}

/**
 * Configure and create a component test with all common Ionic/Angular mocks
 */
export async function setupComponentTest<T>(
    config: ComponentTestConfig<T>
): Promise<ComponentTestContext<T>> {
    const dbServiceMock = createDbServiceMock(config.dbServiceOptions);
    const alertControllerMock = createAlertControllerMock();
    const modalControllerMock = createModalControllerMock();
    const toastControllerMock = createToastControllerMock();
    const loadingControllerMock = createLoadingControllerMock();
    const platformMock = createPlatformMock();
    const navControllerMock = createNavControllerMock();

    const defaultProviders = [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: alertControllerMock },
        { provide: ModalController, useValue: modalControllerMock },
        { provide: ToastController, useValue: toastControllerMock },
        { provide: LoadingController, useValue: loadingControllerMock },
        { provide: Platform, useValue: platformMock },
        { provide: NavController, useValue: navControllerMock },
        ...(config.additionalProviders ?? []),
    ];

    await TestBed.configureTestingModule({
        declarations: config.declarations ?? [config.component],
        imports: [
            IonicModule.forRoot(),
            RouterTestingModule,
            ...(config.imports ?? []),
        ],
        providers: [...defaultProviders, ...(config.providers ?? [])],
        schemas: [config.strictSchema ? NO_ERRORS_SCHEMA : CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    const fixture = TestBed.createComponent(config.component);
    const component = fixture.componentInstance;

    return {
        fixture,
        component,
        dbServiceMock,
        alertControllerMock,
        modalControllerMock,
        toastControllerMock,
        loadingControllerMock,
        platformMock,
        navControllerMock,
    };
}

/**
 * Trigger change detection and wait for stability
 */
export async function detectChangesAndWait<T>(fixture: ComponentFixture<T>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
}

/**
 * Query element by data-testid attribute
 */
export function queryByTestId<T>(
    fixture: ComponentFixture<T>,
    testId: string
): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
}

/**
 * Query all elements by data-testid attribute
 */
export function queryAllByTestId<T>(
    fixture: ComponentFixture<T>,
    testId: string
): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
}

/**
 * Click an element and trigger change detection
 */
export async function clickElement<T>(
    fixture: ComponentFixture<T>,
    element: HTMLElement
): Promise<void> {
    element.click();
    await detectChangesAndWait(fixture);
}

/**
 * Set input value and trigger change detection
 */
export async function setInputValue<T>(
    fixture: ComponentFixture<T>,
    element: HTMLInputElement,
    value: string
): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    element.dispatchEvent(new Event('change'));
    await detectChangesAndWait(fixture);
}
