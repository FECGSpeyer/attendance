import { Component, NgModule } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, RouterModule, provideRouter } from '@angular/router';

@Component({ template: 'A', standalone: true }) class AttCmp {}
@Component({ template: 'P', standalone: true }) class ProtCmp { constructor(public route: ActivatedRoute) {} }

function run(protChild: string, protFirst: boolean) {
  const att = { path: 'attendance/:id', loadChildren: () => Promise.resolve([{ path: '', component: AttCmp }]) };
  const prot = { path: 'attendance/:attendanceId/protocol', loadChildren: () => Promise.resolve([{ path: protChild, component: ProtCmp }]) };
  return [{ path: 'tabs', children: [{ path: 'attendance', loadChildren: () => Promise.resolve([{ path: '', component: AttCmp }]) }, ...(protFirst ? [prot, att] : [att, prot])] }];
}

describe('protocol route', () => {
  for (const [child, first, expectOk] of [[':attendanceId', false, false], ['', true, true]] as const) {
    it(`child=${child} first=${first}`, async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter(run(child, first) as any)] });
      const router = TestBed.inject(Router);
      let ok: boolean;
      try { ok = await router.navigateByUrl('/tabs/attendance/5/protocol'); } catch { ok = false; }
      console.log('RESULT', child, first, ok, router.url);
      expect(ok).toBe(expectOk);
      if (ok) {
        let r = router.routerState.snapshot.root; while (r.firstChild) r = r.firstChild;
        expect(r.params['attendanceId']).toBe('5');
      }
    });
  }
});
