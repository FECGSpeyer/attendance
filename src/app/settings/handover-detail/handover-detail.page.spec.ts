import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HandoverDetailPage } from './handover-detail.page';

describe('HandoverDetailPage', () => {
  let component: HandoverDetailPage;
  let fixture: ComponentFixture<HandoverDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HandoverDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
