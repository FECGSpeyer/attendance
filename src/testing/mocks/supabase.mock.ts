/**
 * Mock Supabase Client for Testing
 * Provides a controllable mock of the Supabase client
 */
import { vi } from 'vitest';

export interface MockSupabaseResponse<T> {
    data: T | null;
    error: any | null;
    count?: number;
}

/**
 * Creates a chainable query builder mock
 */
export function createQueryBuilderMock<T>(
    response: MockSupabaseResponse<T> = { data: null, error: null }
) {
    const mock = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        like: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        containedBy: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(response),
        maybeSingle: vi.fn().mockResolvedValue(response),
        then: vi.fn((resolve) => resolve(response)),
    };

    // Make it thenable (Promise-like)
    Object.defineProperty(mock, 'then', {
        value: (resolve: (value: MockSupabaseResponse<T>) => void) => {
            resolve(response);
            return Promise.resolve(response);
        },
    });

    return mock;
}

/**
 * Creates a mock Supabase channel for realtime subscriptions
 */
export function createChannelMock() {
    const channelMock = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn().mockResolvedValue('ok'),
    };
    return channelMock;
}

/**
 * Creates a full Supabase client mock
 */
export function createSupabaseMock() {
    const defaultQueryBuilder = createQueryBuilderMock({ data: [], error: null });

    return {
        from: vi.fn().mockReturnValue(defaultQueryBuilder),
        channel: vi.fn().mockReturnValue(createChannelMock()),
        removeChannel: vi.fn().mockResolvedValue('ok'),
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
            signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({
                data: { subscription: { unsubscribe: vi.fn() } },
            }),
            resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
            updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
        storage: {
            from: vi.fn().mockReturnValue({
                upload: vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
                download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
                getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } }),
                remove: vi.fn().mockResolvedValue({ data: [], error: null }),
                list: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
        },
        functions: {
            invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
}

/**
 * Helper to configure mock responses for specific tables
 */
export function mockTableResponse<T>(
    supabaseMock: ReturnType<typeof createSupabaseMock>,
    tableName: string,
    response: MockSupabaseResponse<T>
) {
    const queryBuilder = createQueryBuilderMock(response);
    supabaseMock.from.mockImplementation((table: string) => {
        if (table === tableName) {
            return queryBuilder;
        }
        return createQueryBuilderMock({ data: [], error: null });
    });
    return queryBuilder;
}

export type MockSupabaseClient = ReturnType<typeof createSupabaseMock>;
