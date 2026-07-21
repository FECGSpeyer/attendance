import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService } from '../services/db.service';
import { PushService } from '../services/push/push.service';

/**
 * Resolver route for appointment deep links embedded in reminder emails /
 * Telegram messages (e.g. https://attendix.de/open-attendance?id=42&tenantId=7).
 *
 * It authenticates, switches to the link's tenant if needed, then delegates to
 * PushService.navigateToAttendance() so a web link routes exactly like a push:
 * players land on /tabs/signout with the attendance's action sheet open, while
 * admins/responsibles open the full detail page. This is important because most
 * reminder recipients are Role.PLAYER, who have no access to the attendance
 * list/detail page and would otherwise be bounced.
 */
@Component({
  selector: 'app-open-attendance',
  templateUrl: './open-attendance.page.html',
  styleUrls: ['./open-attendance.page.scss'],
  standalone: false,
})
export class OpenAttendancePage implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private db: DbService,
    private pushService: PushService,
  ) {}

  async ngOnInit(): Promise<void> {
    const idParam = this.route.snapshot.queryParamMap.get('id');
    const tenantIdParam = this.route.snapshot.queryParamMap.get('tenantId');
    const attendanceId = Number(idParam);

    // Malformed link — fall back to the normal entry flow.
    if (!idParam || Number.isNaN(attendanceId)) {
      await this.router.navigateByUrl('/login');
      return;
    }

    // checkToken() is idempotent; it loads tenant/tenantUser if a session exists.
    await this.db.checkToken();

    if (!this.db.tenantUser()) {
      // Not logged in: stash the pending attendance so the destination page
      // opens it after LoginGuard redirects the user to their landing page,
      // then send them through login.
      this.pushService.pendingAttendanceId.set(attendanceId);
      await this.router.navigateByUrl('/login');
      return;
    }

    // Switch to the link's tenant if it differs from the active one.
    if (tenantIdParam && Number(tenantIdParam) !== this.db.tenant()?.id) {
      await this.db.setTenant(Number(tenantIdParam));
    }

    // Opening an appointment via an email/Telegram deep link marks any matching
    // notification-center entries for this attendance read. Best-effort.
    try {
      await this.db.markNotificationsReadByAttendance(
        attendanceId,
        tenantIdParam ? Number(tenantIdParam) : undefined,
      );
    } catch (e) {
      console.error('[open-attendance] markNotificationsReadByAttendance failed:', e);
    }

    await this.pushService.navigateToAttendance(attendanceId);
  }
}
