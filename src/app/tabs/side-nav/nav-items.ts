import { Role } from 'src/app/utilities/constants';

/** Was die Navigation über Nutzer und Instanz wissen muss. */
export interface NavContext {
  role: Role;
  tenantType?: string;
  hasMultipleTenants: boolean;
  showMembersList: boolean;
  hasOrganisation: boolean;
  canAccessFiles: boolean;
  /** Teamorganisation sichtbar (Leitung, Team-Kreis oder eigene Aufgaben). */
  showTeam: boolean;
}

export type NavBadgeKey = 'pendingPersons' | 'openTasks';
export type NavAction = 'planning' | 'stats';

export interface NavItem {
  id: string;
  icon: string;
  labelKey: string;
  /** Ziel-Route (absolut). Entweder `route` oder `action`. */
  route?: string;
  /** Öffnet ein Modal statt einer Seite. */
  action?: NavAction;
  badge?: NavBadgeKey;
}

export interface NavGroup {
  id: 'main' | 'team' | 'account';
  /** Überschrift; ohne Schlüssel wird keine Überschrift angezeigt. */
  labelKey?: string;
  items: NavItem[];
}

const CONDUCTOR_ROLES = [Role.ADMIN, Role.VIEWER, Role.RESPONSIBLE];
const ADMIN_ROLES = [Role.ADMIN, Role.RESPONSIBLE];
const HELPER_ROLES = [Role.HELPER, Role.VOICE_LEADER_HELPER];
const PLAYER_ROLES = [Role.PLAYER, Role.NONE];
const MEMBERS_LIST_ROLES = [Role.HELPER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.PLAYER, Role.NONE];

/**
 * Einträge des Sidepanels, gruppiert und nach Rolle gefiltert.
 * Die Sichtbarkeit der Hauptbereiche entspricht der Tabbar (`tabs.page.ts`),
 * dazu kommen Bereiche, die auf dem Handy unter „Mehr“ liegen.
 */
export function buildNavGroups(ctx: NavContext): NavGroup[] {
  const role = ctx.role;
  const isConductor = CONDUCTOR_ROLES.includes(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const isHelper = HELPER_ROLES.includes(role);
  const isPlayer = PLAYER_ROLES.includes(role);
  const isParent = role === Role.PARENT;
  const isApplicant = role === Role.APPLICANT;
  const isGeneral = ctx.tenantType === 'general';
  const isVoiceLeader = [Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);

  const main: NavItem[] = [];
  const team: NavItem[] = [];

  if (isAdmin) {
    main.push({ id: 'dashboard', icon: 'grid-outline', labelKey: 'tabs.dashboard', route: '/tabs/home-dashboard' });
  }
  if (isParent) {
    main.push({ id: 'parents', icon: 'person-outline', labelKey: 'tabs.events', route: '/tabs/parents' });
  }
  if (!isConductor && !isParent) {
    main.push({ id: 'signout', icon: 'person-outline', labelKey: 'tabs.myEvents', route: '/tabs/signout' });
  }
  if ((isPlayer || isHelper) && ctx.hasMultipleTenants) {
    main.push({ id: 'overview', icon: 'calendar-outline', labelKey: 'tabs.overview', route: '/tabs/overview' });
  }
  if (isHelper || isConductor) {
    main.push({ id: 'attendance', icon: 'checkbox-outline', labelKey: 'tabs.events', route: '/tabs/attendance' });
  }
  if (isConductor) {
    main.push({ id: 'player', icon: 'people-outline', labelKey: 'common.people', route: '/tabs/player', badge: isAdmin ? 'pendingPersons' : undefined });
  }
  if (MEMBERS_LIST_ROLES.includes(role) && ctx.showMembersList) {
    main.push({ id: 'members', icon: 'people-outline', labelKey: 'tabs.members', route: '/tabs/members' });
  }
  if (!isGeneral && !isApplicant && !isParent) {
    main.push({ id: 'songs', icon: 'musical-notes-outline', labelKey: 'tabs.songs', route: '/tabs/songs-tab' });
  }
  if (isAdmin) {
    main.push({ id: 'planning', icon: 'document-text-outline', labelKey: 'settings.runSheets', action: 'planning' });
  }
  if (isVoiceLeader && !isGeneral) {
    main.push({ id: 'voiceLeader', icon: 'musical-note-outline', labelKey: 'settings.myVoice', route: '/tabs/settings/voice-leader' });
  }

  if (ctx.showTeam) {
    team.push({ id: 'team', icon: 'layers-outline', labelKey: 'teamOrg.title', route: '/tabs/settings/team-organization', badge: 'openTasks' });
  }
  if (isAdmin) {
    team.push({ id: 'messages', icon: 'megaphone-outline', labelKey: 'settings.announcements', route: '/tabs/settings/messages' });
  }
  if (ctx.canAccessFiles) {
    team.push({ id: 'files', icon: 'folder-outline', labelKey: 'settings.fileStorage', route: '/tabs/settings/files' });
  }
  if (isAdmin) {
    team.push({ id: 'stats', icon: 'stats-chart-outline', labelKey: 'stats.title', action: 'stats' });
  }
  if (isAdmin && ctx.hasOrganisation) {
    team.push({ id: 'organisation', icon: 'business-outline', labelKey: 'settings.organisation', route: '/tabs/org-plans' });
  }

  const account: NavItem[] = [
    { id: 'settings', icon: 'settings-outline', labelKey: 'settings.settings', route: '/tabs/settings' },
    { id: 'help', icon: 'help-circle-outline', labelKey: 'settings.help', route: '/tabs/settings/help' },
  ];

  // Verwaltende Rollen bekommen drei Gruppen mit Überschrift. Für alle anderen
  // wäre eine „Team“-Gruppe mit nur der Dateiablage verwirrend: Ihre Einträge
  // stehen ohne Überschrift oben, nur „Konto“ ist abgesetzt.
  if (isAdmin) {
    return [
      { id: 'main', labelKey: 'nav.groupOverview', items: main },
      { id: 'team', labelKey: 'nav.groupTeam', items: team },
      { id: 'account', labelKey: 'nav.groupAdmin', items: account },
    ].filter(g => g.items.length) as NavGroup[];
  }
  return [
    { id: 'main', items: [...main, ...team] },
    { id: 'account', labelKey: 'nav.groupAccount', items: account },
  ].filter(g => g.items.length) as NavGroup[];
}

/**
 * Id des aktiven Eintrags: die längste passende Route gewinnt. So bleibt
 * „Einstellungen“ für alle Unterseiten aktiv, die keinen eigenen Eintrag haben,
 * während z. B. `/tabs/settings/files` die Dateiablage markiert.
 */
export function activeNavItemId(groups: NavGroup[], url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  let best: NavItem | null = null;
  for (const item of groups.flatMap(g => g.items)) {
    if (!item.route) continue;
    const matches = path === item.route || path.startsWith(item.route + '/');
    if (matches && (!best || item.route.length > best.route!.length)) {
      best = item;
    }
  }
  return best?.id ?? null;
}
