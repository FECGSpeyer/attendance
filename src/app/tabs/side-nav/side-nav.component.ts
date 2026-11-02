import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { IonicModule, MenuController, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DbService } from 'src/app/services/db.service';
import { LayoutService } from 'src/app/services/layout/layout.service';
import { NotificationBellComponent } from 'src/app/shared/notification-bell/notification-bell.component';
import { Role } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';
import { NavAction, NavBadgeKey, NavGroup, NavItem, activeNavItemId, buildNavGroups } from './nav-items';

export const SIDE_NAV_MENU_ID = 'side-nav';
/** Badges höchstens so oft neu laden (Navigation löst sonst bei jedem Klick Abfragen aus). */
const BADGE_REFRESH_MIN_GAP_MS = 60 * 1000;

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, TranslocoModule, NotificationBellComponent],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent {
  readonly db = inject(DbService);
  readonly layout = inject(LayoutService);
  private router = inject(Router);
  private menu = inject(MenuController);
  private modalController = inject(ModalController);
  private destroyRef = inject(DestroyRef);

  private readonly url = signal(this.router.url);
  private readonly hasOwnTasks = signal(false);
  readonly badges = signal<Record<NavBadgeKey, number>>({ pendingPersons: 0, openTasks: 0 });
  private lastBadgeRefresh = 0;

  readonly groups = computed<NavGroup[]>(() => {
    const tenantUser = this.db.tenantUser();
    const tenant = this.db.tenant();
    if (!tenantUser || !tenant) return [];
    const teamOrg = this.db.teamOrgEnabled();
    return buildNavGroups({
      role: tenantUser.role,
      tenantType: tenant.type,
      hasMultipleTenants: (this.db.tenants()?.length || 0) > 1,
      showMembersList: tenant.showMembersList === true,
      hasOrganisation: !!this.db.organisation(),
      canAccessFiles: this.db.canAccessFiles(),
      showTeam: teamOrg && (this.db.isTeamLeader() || this.db.inTeamCircle() || this.hasOwnTasks()),
    });
  });

  readonly activeId = computed(() => activeNavItemId(this.groups(), this.url()));
  readonly hasMultipleTenants = computed(() => (this.db.tenants()?.length || 0) > 1);
  readonly tenantInitials = computed(() => initials(this.db.tenant()?.shortName || this.db.tenant()?.longName || ''));
  readonly userName = signal('');
  readonly userImg = signal<string | null>(null);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(e => {
        this.url.set(e.urlAfterRedirects);
        void this.refreshBadges();
      });

    // Bei Instanzwechsel Badges, Profil und Aufgaben-Zugang neu laden.
    effect(() => {
      const tenant = this.db.tenant();
      this.db.tenantUser();
      if (!tenant) return;
      void this.refreshBadges(true);
      void this.loadProfile();
    });
  }

  /** Strg/⌘ + B klappt das feste Panel ein und aus (wie in Notion, VS Code). */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.layout.sidePanelFixed()) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
      const target = event.target as HTMLElement | null;
      // Nicht in Eingabefeldern und Editoren (dort ist Strg+B „fett“).
      if (target?.closest('input, textarea, [contenteditable="true"], .ProseMirror')) return;
      event.preventDefault();
      this.layout.toggleCollapsed();
    }
  }

  toggleCollapsed(): void {
    this.layout.toggleCollapsed();
  }

  async closeOverlay(): Promise<void> {
    await this.menu.close(SIDE_NAV_MENU_ID);
  }

  badgeFor(item: NavItem): number {
    return item.badge ? this.badges()[item.badge] : 0;
  }

  async onItem(item: NavItem): Promise<void> {
    if (!this.layout.sidePanelFixed()) {
      await this.menu.close(SIDE_NAV_MENU_ID);
    }
    if (item.action) {
      await this.runAction(item.action);
    } else if (item.route) {
      await this.router.navigateByUrl(item.route);
    }
  }

  async openProfile(): Promise<void> {
    if (!this.layout.sidePanelFixed()) {
      await this.menu.close(SIDE_NAV_MENU_ID);
    }
    await this.router.navigateByUrl('/tabs/settings');
  }

  async onTenantChange(tenantId: number): Promise<void> {
    if (this.db.tenant()?.id === tenantId) return;
    const loading = await Utils.getLoadingElement();
    await loading.present();
    if (!this.layout.sidePanelFixed()) {
      await this.menu.close(SIDE_NAV_MENU_ID);
    }
    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }

  async logout(): Promise<void> {
    await this.menu.close(SIDE_NAV_MENU_ID);
    await this.db.logout();
  }

  private async runAction(action: NavAction): Promise<void> {
    // Modale Seiten erst bei Bedarf laden, damit das Panel den Start nicht verlangsamt.
    if (action === 'planning') {
      await import('src/app/planning/planning.module');
      const { PlanningPage } = await import('src/app/planning/planning.page');
      const modal = await this.modalController.create({ component: PlanningPage, cssClass: 'planningModal' });
      await modal.present();
    } else if (action === 'stats') {
      await import('src/app/stats/stats.module');
      const { StatsPage } = await import('src/app/stats/stats.page');
      const modal = await this.modalController.create({ component: StatsPage });
      await modal.present();
    }
  }

  private async refreshBadges(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastBadgeRefresh < BADGE_REFRESH_MIN_GAP_MS) return;
    this.lastBadgeRefresh = now;

    const role = this.db.tenantUser()?.role;
    if (!role || !this.db.tenant()) return;
    const isAdmin = role === Role.ADMIN || role === Role.RESPONSIBLE;

    try {
      const [pending, tasks] = await Promise.all([
        isAdmin ? this.db.getPendingPersons() : Promise.resolve([]),
        this.db.teamOrgEnabled() ? this.db.getMyTasks() : Promise.resolve([]),
      ]);
      const openTasks = tasks.filter(t => t.status !== 'completed').length;
      this.hasOwnTasks.set(tasks.length > 0);
      this.badges.set({ pendingPersons: pending.length, openTasks });
    } catch (e) {
      console.error('side-nav badges', e);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      const profile = await this.db.getPlayerProfile();
      this.userName.set(profile ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() : (this.db.user?.email ?? ''));
      this.userImg.set(profile?.img || null);
    } catch {
      this.userName.set(this.db.user?.email ?? '');
    }
  }

  roleKey(): string {
    const role = this.db.tenantUser()?.role;
    const map: Partial<Record<Role, string>> = {
      [Role.ADMIN]: 'roles.administrator',
      [Role.RESPONSIBLE]: 'roles.responsible',
      [Role.HELPER]: 'roles.helper',
      [Role.VOICE_LEADER]: 'settings.voiceLeader',
      [Role.VOICE_LEADER_HELPER]: 'roles.voiceLeaderHelper',
      [Role.PLAYER]: 'roles.member',
      [Role.VIEWER]: 'settings.viewers',
      [Role.PARENT]: 'roles.parent',
      [Role.APPLICANT]: 'roles.applicant',
    };
    return map[role] ?? '';
  }

  initialsOf(name: string): string {
    return initials(name);
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
