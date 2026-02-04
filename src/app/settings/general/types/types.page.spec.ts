import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, IonRouterOutlet } from '@ionic/angular';

import { TypesPage } from './types.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../../../testing/mocks/ionic.mock';

describe('TypesPage', () => {
  let component: TypesPage;
  let fixture: ComponentFixture<TypesPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
    nativeEl: {},
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [TypesPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TypesPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with reorder disabled', () => {
    expect(component.reorder).toBe(false);
  });
});
