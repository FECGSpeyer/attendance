import { describe, expect, it } from 'vitest';
import { Role } from 'src/app/utilities/constants';
import { NavContext, activeNavItemId, buildNavGroups } from './nav-items';

const base: NavContext = {
  role: Role.ADMIN,
  tenantType: 'choir',
  hasMultipleTenants: false,
  showMembersList: false,
  hasOrganisation: false,
  canAccessFiles: true,
  showTeam: true,
};

const ids = (ctx: NavContext) => buildNavGroups(ctx).flatMap(g => g.items.map(i => i.id));

describe('buildNavGroups', () => {
  it('gives admins three labelled groups with the extra areas', () => {
    const groups = buildNavGroups(base);
    expect(groups.map(g => g.labelKey)).toEqual(['nav.groupOverview', 'nav.groupTeam', 'nav.groupAdmin']);
    expect(ids(base)).toEqual(['dashboard', 'attendance', 'player', 'songs', 'planning', 'team', 'messages', 'files', 'stats', 'settings', 'help']);
    expect(groups[0].items.find(i => i.id === 'player')?.badge).toBe('pendingPersons');
    expect(groups[1].items.find(i => i.id === 'team')?.badge).toBe('openTasks');
  });

  it('adds the organisation only when the tenant belongs to one', () => {
    expect(ids(base)).not.toContain('organisation');
    expect(ids({ ...base, hasOrganisation: true })).toContain('organisation');
  });

  it('shows members only their own areas, without a "Team" heading', () => {
    const ctx: NavContext = { ...base, role: Role.PLAYER, hasMultipleTenants: true, showMembersList: true, canAccessFiles: false, showTeam: false };
    const groups = buildNavGroups(ctx);
    expect(groups.map(g => g.labelKey)).toEqual([undefined, 'nav.groupAccount']);
    expect(ids(ctx)).toEqual(['signout', 'overview', 'members', 'songs', 'settings', 'help']);
  });

  it('hides members list, songs and overview where the tab bar hides them', () => {
    const ctx: NavContext = { ...base, role: Role.PLAYER, tenantType: 'general', showMembersList: false, canAccessFiles: false, showTeam: false };
    expect(ids(ctx)).toEqual(['signout', 'settings', 'help']);
  });

  it('gives parents their events page and no songs', () => {
    const ctx: NavContext = { ...base, role: Role.PARENT, canAccessFiles: false, showTeam: false };
    expect(ids(ctx)).toEqual(['parents', 'settings', 'help']);
  });

  it('gives viewers the events and people without admin areas or badges', () => {
    const ctx: NavContext = { ...base, role: Role.VIEWER, canAccessFiles: false, showTeam: false };
    const groups = buildNavGroups(ctx);
    expect(ids(ctx)).toEqual(['attendance', 'player', 'songs', 'settings', 'help']);
    expect(groups[0].items.find(i => i.id === 'player')?.badge).toBeUndefined();
  });

  it('links voice leaders to their voice', () => {
    expect(ids({ ...base, role: Role.VOICE_LEADER, showTeam: false, canAccessFiles: false })).toContain('voiceLeader');
  });
});

describe('activeNavItemId', () => {
  const groups = buildNavGroups(base);

  it('matches the longest route', () => {
    expect(activeNavItemId(groups, '/tabs/settings/files?path=a')).toBe('files');
    expect(activeNavItemId(groups, '/tabs/settings/general')).toBe('settings');
    expect(activeNavItemId(groups, '/tabs/settings')).toBe('settings');
    expect(activeNavItemId(groups, '/tabs/attendance/12')).toBe('attendance');
  });

  it('returns null for pages outside the panel', () => {
    expect(activeNavItemId(groups, '/tabs/members')).toBeNull();
  });
});
