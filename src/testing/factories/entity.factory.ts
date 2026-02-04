/**
 * Test Factories for Attendix
 * Creates mock data for testing with sensible defaults
 */
import { AttendanceStatus, Role } from '../../app/utilities/constants';
import {
  Tenant,
  TenantUser,
  Player,
  Group,
  Attendance,
  PersonAttendance,
  Person,
} from '../../app/utilities/interfaces';

let idCounter = 1;
const nextId = () => idCounter++;

/**
 * Reset ID counter between tests
 */
export function resetFactoryIds(): void {
  idCounter = 1;
}

/**
 * Create a mock Tenant
 */
export function createTenant(overrides: Partial<Tenant> = {}): Tenant {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    shortName: `Tenant${id}`,
    longName: `Test Tenant ${id}`,
    maintainTeachers: false,
    showHolidays: true,
    type: 'orchestra',
    withExcuses: true,
    betaProgram: false,
    ...overrides,
  };
}

/**
 * Create a mock TenantUser
 */
export function createTenantUser(overrides: Partial<TenantUser> = {}): TenantUser {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    tenantId: overrides.tenantId ?? 1,
    userId: overrides.userId ?? `user-${id}`,
    role: overrides.role ?? Role.ADMIN,
    email: overrides.email ?? `user${id}@test.com`,
    favorite: false,
    ...overrides,
  };
}

/**
 * Create a mock Group (Instrument)
 */
export function createGroup(overrides: Partial<Group> = {}): Group {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    name: overrides.name ?? `Group ${id}`,
    tenantId: overrides.tenantId ?? 1,
    maingroup: true,
    ...overrides,
  };
}

/**
 * Create a mock Player
 */
export function createPlayer(overrides: Partial<Player> = {}): Player {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    firstName: overrides.firstName ?? `FirstName${id}`,
    lastName: overrides.lastName ?? `LastName${id}`,
    birthday: overrides.birthday ?? '2000-01-01',
    joined: overrides.joined ?? '2020-01-01',
    notes: '',
    instrument: overrides.instrument ?? 1,
    hasTeacher: false,
    playsSince: '2020-01-01',
    isLeader: false,
    isCritical: false,
    correctBirthday: true,
    history: [],
    tenantId: overrides.tenantId ?? 1,
    pending: false,
    self_register: false,
    ...overrides,
  };
}

/**
 * Create a mock Person (base for Player/Parent/Viewer)
 */
export function createPerson(overrides: Partial<Person> = {}): Person {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    firstName: `FirstName${id}`,
    lastName: `LastName${id}`,
    birthday: '2000-01-01',
    joined: '2020-01-01',
    notes: '',
    tenantId: 1,
    pending: false,
    self_register: false,
    ...overrides,
  };
}

/**
 * Create a mock Attendance record
 */
export function createAttendance(overrides: Partial<Attendance> = {}): Attendance {
  const id = overrides.id ?? nextId();
  return {
    id,
    created_at: new Date().toISOString(),
    date: overrides.date ?? new Date().toISOString().split('T')[0],
    type_id: overrides.type_id ?? 'general',
    save_in_history: true,
    typeInfo: overrides.typeInfo ?? 'Test Attendance',
    notes: '',
    tenantId: overrides.tenantId ?? 1,
    ...overrides,
  };
}

/**
 * Create a mock PersonAttendance record
 */
export function createPersonAttendance(
  overrides: Partial<PersonAttendance> = {}
): PersonAttendance {
  return {
    id: overrides.id ?? `pa-${nextId()}`,
    attendance_id: overrides.attendance_id ?? 1,
    person_id: overrides.person_id ?? 1,
    status: overrides.status ?? AttendanceStatus.Present,
    notes: '',
    ...overrides,
  };
}

/**
 * Create multiple players for testing lists
 */
export function createPlayers(count: number, tenantId: number = 1): Player[] {
  return Array.from({ length: count }, (_, i) =>
    createPlayer({
      tenantId,
      firstName: `Player${i + 1}`,
      lastName: `Test`,
      instrument: (i % 3) + 1, // Distribute across 3 instruments
    })
  );
}

/**
 * Create multiple groups for testing
 */
export function createGroups(count: number, tenantId: number = 1): Group[] {
  const groupNames = ['Violin', 'Viola', 'Cello', 'Bass', 'Flute', 'Clarinet'];
  return Array.from({ length: count }, (_, i) =>
    createGroup({
      tenantId,
      name: groupNames[i] ?? `Group ${i + 1}`,
    })
  );
}
