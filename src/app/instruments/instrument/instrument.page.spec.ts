import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { InstrumentPage } from './instrument.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../../testing/mocks/ionic.mock';

describe('InstrumentPage', () => {
  let component: InstrumentPage;
  let fixture: ComponentFixture<InstrumentPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InstrumentPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(InstrumentPage);
    component = fixture.componentInstance;
    // Set required @Input
    component.group = { id: 1, name: 'Test Group', tenantId: 1 } as any;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
