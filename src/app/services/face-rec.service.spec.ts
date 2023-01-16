import { TestBed } from '@angular/core/testing';

import { FaceRecService } from './face-rec.service';

describe('FaceRecService', () => {
  let service: FaceRecService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FaceRecService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
