import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SongViewerPage } from './song-viewer.page';

describe('SongViewerPage', () => {
  let component: SongViewerPage;
  let fixture: ComponentFixture<SongViewerPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SongViewerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
