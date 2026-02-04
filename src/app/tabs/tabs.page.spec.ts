import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TabsPage } from './tabs.page';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  const mockTenantUser = signal({ role: Role.ADMIN });
  const mockTenants = signal([{ id: '1', name: 'Test Tenant' }]);

  const mockDbService = {
    tenantUser: mockTenantUser,
    tenants: mockTenants,
  };

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
    url: '/tabs/attendance',
  };

  beforeEach(async () => {
    // Reset signals before each test
    mockTenantUser.set({ role: Role.ADMIN });
    mockTenants.set([{ id: '1', name: 'Test Tenant' }]);

    await TestBed.configureTestingModule({
      declarations: [TabsPage],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: DbService, useValue: mockDbService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    // Don't call detectChanges as it triggers the effect() which needs injection context
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should identify admin as conductor after initialize', () => {
    // Component constructor calls initialize(), which sets isConductor
    expect(component.isConductor).toBe(true);
    expect(component.isHelper).toBe(false);
    expect(component.isPlayer).toBe(false);
  });

  it('should detect single tenant', () => {
    expect(component.hasMultipleTenants).toBe(false);
  });
});
