import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppComponent } from './app.component';
import { createDbServiceMock } from '../testing/mocks/db-service.mock';
import { createPlatformMock, createAlertControllerMock } from '../testing/mocks/ionic.mock';
import { DbService } from './services/db.service';
import { Platform, AlertController } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { Storage } from '@ionic/storage-angular';

describe('AppComponent', () => {
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;
  let platformMock: ReturnType<typeof createPlatformMock>;
  let alertControllerMock: ReturnType<typeof createAlertControllerMock>;

  const mockStorage = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockTitle = {
    setTitle: vi.fn(),
    getTitle: vi.fn().mockReturnValue('Attendix'),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();
    platformMock = createPlatformMock();
    alertControllerMock = createAlertControllerMock();

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [RouterTestingModule],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: Platform, useValue: platformMock },
        { provide: AlertController, useValue: alertControllerMock },
        { provide: Storage, useValue: mockStorage },
        { provide: Title, useValue: mockTitle },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should set page title on init', () => {
    TestBed.createComponent(AppComponent);
    expect(mockTitle.setTitle).toHaveBeenCalledWith('Attendix');
  });

  it('should create storage on ngOnInit', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.componentInstance.ngOnInit();
    expect(mockStorage.create).toHaveBeenCalled();
  });
});
