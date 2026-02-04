/**
 * Service Test Helpers
 */
import { TestBed, TestModuleMetadata } from '@angular/core/testing';
import { Type } from '@angular/core';

export interface ServiceTestConfig<T> extends Partial<TestModuleMetadata> {
    service: Type<T>;
}

/**
 * Configure and create a service test
 */
export async function setupServiceTest<T>(
    config: ServiceTestConfig<T>
): Promise<{ service: T }> {
    await TestBed.configureTestingModule({
        providers: [config.service, ...(config.providers ?? [])],
        imports: config.imports ?? [],
    }).compileComponents();

    const service = TestBed.inject(config.service);
    return { service };
}
