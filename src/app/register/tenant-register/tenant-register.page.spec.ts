import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TenantRegisterPage } from './tenant-register.page';

describe('TenantRegisterPage', () => {
  let component: TenantRegisterPage;
  let fixture: ComponentFixture<TenantRegisterPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TenantRegisterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
