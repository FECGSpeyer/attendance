/**
 * Mock DbService for Testing
 * Provides a testable mock of the main database service
 */
import { vi } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { Role } from '../../app/utilities/constants';
import {
    Tenant,
    TenantUser,
    Group,
    AttendanceType,
    ShiftPlan,
    Church,
    Organisation,
    SongCategory,
} from '../../app/utilities/interfaces';
import { createSupabaseMock, MockSupabaseClient } from './supabase.mock';
import { createTenant, createTenantUser, createGroups } from '../factories/entity.factory';

export interface DbServiceMockOptions {
    tenant?: Tenant;
    tenantUser?: TenantUser;
    tenants?: Tenant[];
    groups?: Group[];
    role?: Role;
}

/**
 * Creates a mock DbService with configurable initial state
 */
export const createDbServiceMock = (options: DbServiceMockOptions = {}) => {
    const defaultTenant = options.tenant ?? createTenant();
    const defaultTenantUser = options.tenantUser ?? createTenantUser({ role: options.role ?? Role.ADMIN });
    const defaultGroups = options.groups ?? createGroups(3);

    const supabaseMock = createSupabaseMock();

    return {
        // Signals
        tenant: signal<Tenant | undefined>(defaultTenant) as WritableSignal<Tenant | undefined>,
        tenantUser: signal<TenantUser | undefined>(defaultTenantUser) as WritableSignal<TenantUser | undefined>,
        tenants: signal<Tenant[] | undefined>(options.tenants ?? [defaultTenant]) as WritableSignal<Tenant[] | undefined>,
        tenantUsers: signal<TenantUser[] | undefined>([defaultTenantUser]) as WritableSignal<TenantUser[] | undefined>,
        groups: signal<Group[]>(defaultGroups) as WritableSignal<Group[]>,
        attendanceTypes: signal<AttendanceType[]>([]) as WritableSignal<AttendanceType[]>,
        shifts: signal<ShiftPlan[]>([]) as WritableSignal<ShiftPlan[]>,
        churches: signal<Church[] | undefined>(undefined) as WritableSignal<Church[] | undefined>,
        songCategories: signal<SongCategory[]>([]) as WritableSignal<SongCategory[]>,
        organisation: signal<Organisation | null>(null) as WritableSignal<Organisation | null>,

        // User
        user: { id: 'test-user-id', email: 'test@test.com' },
        attDate: new Date().toISOString().split('T')[0],

        // Supabase access
        getSupabase: vi.fn().mockReturnValue(supabaseMock),
        _supabaseMock: supabaseMock, // For test configuration

        // Mock modular services
        authSvc: {
            signIn: vi.fn().mockResolvedValue({ user: null, session: null }),
            signOut: vi.fn().mockResolvedValue(undefined),
            signUp: vi.fn().mockResolvedValue({ user: null, session: null }),
            resetPassword: vi.fn().mockResolvedValue(undefined),
        },
        playerSvc: {
            getPlayers: vi.fn().mockResolvedValue([]),
            getPlayer: vi.fn().mockResolvedValue(null),
            createPlayer: vi.fn().mockResolvedValue(null),
            updatePlayer: vi.fn().mockResolvedValue(null),
            deletePlayer: vi.fn().mockResolvedValue(undefined),
        },
        attendanceSvc: {
            getAttendances: vi.fn().mockResolvedValue([]),
            getAttendance: vi.fn().mockResolvedValue(null),
            createAttendance: vi.fn().mockResolvedValue(null),
            updateAttendance: vi.fn().mockResolvedValue(null),
            deleteAttendance: vi.fn().mockResolvedValue(undefined),
        },
        groupSvc: {
            getGroups: vi.fn().mockResolvedValue(defaultGroups),
            getGroup: vi.fn().mockResolvedValue(null),
            createGroup: vi.fn().mockResolvedValue(null),
            updateGroup: vi.fn().mockResolvedValue(null),
            deleteGroup: vi.fn().mockResolvedValue(undefined),
        },
        tenantSvc: {
            getTenant: vi.fn().mockResolvedValue(defaultTenant),
            updateTenant: vi.fn().mockResolvedValue(null),
        },
        songSvc: {
            getSongs: vi.fn().mockResolvedValue([]),
            getSong: vi.fn().mockResolvedValue(null),
        },
        meetingSvc: {
            getMeetings: vi.fn().mockResolvedValue([]),
        },
        historySvc: {
            getHistory: vi.fn().mockResolvedValue([]),
        },
        notificationSvc: {
            getConfig: vi.fn().mockResolvedValue(null),
        },
        imageSvc: {
            uploadImage: vi.fn().mockResolvedValue('https://test.com/image.jpg'),
        },
        shiftSvc: {
            getShifts: vi.fn().mockResolvedValue([]),
        },
        attTypeSvc: {
            getAttendanceTypes: vi.fn().mockResolvedValue([]),
        },
        feedbackSvc: {
            submitFeedback: vi.fn().mockResolvedValue(undefined),
        },
        holidaySvc: {
            getHolidays: vi.fn().mockResolvedValue([]),
        },

        // Legacy methods (for backward compatibility)
        login: vi.fn().mockResolvedValue(true),
        logout: vi.fn().mockResolvedValue(undefined),
        resetPassword: vi.fn().mockResolvedValue(undefined),
        updatePassword: vi.fn().mockResolvedValue(undefined),
        createInstance: vi.fn().mockResolvedValue(undefined),
        getPlayers: vi.fn().mockResolvedValue([]),
        getPlayersForAttendance: vi.fn().mockResolvedValue([]),
        getAttendances: vi.fn().mockResolvedValue([]),
        getGroups: vi.fn().mockResolvedValue(defaultGroups),
        getSongs: vi.fn().mockResolvedValue([]),
        getMeetings: vi.fn().mockResolvedValue([]),
        getTeachers: vi.fn().mockResolvedValue([]),
        getHistory: vi.fn().mockResolvedValue([]),
        getConductors: vi.fn().mockResolvedValue([]),
        getAttendanceById: vi.fn().mockResolvedValue(null),
        getGroupCategories: vi.fn().mockResolvedValue([]),
        getMainGroup: vi.fn().mockReturnValue({ id: 1, name: 'Main Group' }),
        updateTeacher: vi.fn().mockResolvedValue(undefined),
        updateAttendanceType: vi.fn().mockResolvedValue(undefined),
        getLinkedTenants: vi.fn().mockResolvedValue([]),
        getTenantsFromUser: vi.fn().mockResolvedValue([]),
        isShiftUsed: vi.fn().mockResolvedValue(false),
        updateShift: vi.fn().mockResolvedValue(undefined),
        getTenantBySongSharingId: vi.fn().mockResolvedValue(null),
        getCurrentSongs: vi.fn().mockResolvedValue([]),
    };
};

export type MockDbService = ReturnType<typeof createDbServiceMock>;
