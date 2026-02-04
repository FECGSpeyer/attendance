import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { MeetingListPage } from './meeting-list.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';

describe('MeetingListPage', () => {
  let component: MeetingListPage;
  let fixture: ComponentFixture<MeetingListPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MeetingListPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MeetingListPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
