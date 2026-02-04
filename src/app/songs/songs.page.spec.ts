import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';

import { SongsPage } from './songs.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('SongsPage', () => {
  let component: SongsPage;
  let fixture: ComponentFixture<SongsPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockStorage = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [SongsPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: Storage, useValue: mockStorage },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SongsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty songs array', () => {
    expect(component.songs).toEqual([]);
    expect(component.songsFiltered).toEqual([]);
  });
});
