import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular/lazy';

import { StatsPage } from './stats.page';
import { FieldType } from '../utilities/constants';
import { Player } from '../utilities/interfaces';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('StatsPage', () => {
  let component: StatsPage;
  let fixture: ComponentFixture<StatsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StatsPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(StatsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('additional field statistics', () => {
    const field = { id: 'shirt', name: 'T-Shirt', type: FieldType.SELECT, defaultValue: 'M', options: ['S', 'M', 'L'] };
    const person = (id: number, instrument: number, value: any, extra: Partial<Player> = {}) =>
      ({ id, instrument, firstName: 'P', lastName: `${id}`, additional_fields: value === undefined ? {} : { shirt: value }, ...extra }) as Player;

    beforeEach(() => {
      component.groups = [{ id: 1, name: 'Sopran' }, { id: 2, name: 'Alt' }] as any;
      component.distributionFields = [field as any];
      component.selectedFieldId = 'shirt';
      component.players = [
        person(1, 1, 'S'),
        person(2, 1, 'M'),
        person(3, 2, undefined),
        person(4, 2, 'XL'),
        person(5, 2, 'L', { paused: true }),
        person(6, 1, 'L', { left: true }),
      ];
    });

    it('counts active people per option, uses the default for missing values and keeps unknown values', () => {
      component.updateFieldStats();
      expect(component.fieldStatsTotal).toBe(4);
      expect(component.fieldStatsRows.map(r => [r.label, r.count, r.perc])).toEqual([
        ['S', 1, 25], ['M', 2, 50], ['L', 0, 0], ['XL', 1, 25],
      ]);
      expect(component.fieldGroupBarData.labels).toEqual(['Sopran (2)', 'Alt (2)']);
    });

    it('can include paused people and filter by group', () => {
      component.fieldStatsIncludePaused = true;
      component.fieldStatsGroupId = 2;
      component.updateFieldStats();
      expect(component.fieldStatsTotal).toBe(3);
      expect(component.fieldStatsRows.find(r => r.label === 'L')?.count).toBe(1);
      expect(component.fieldGroupBarData.labels).toEqual([]);
    });
  });
});
