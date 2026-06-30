import type { IPgComponent } from '@dcl/pg-component'

/**
 * Builds a jest-mocked IPgComponent. Only `query` is exercised by the storage
 * adapters; the remaining methods are stubbed so the object satisfies the type.
 */
export function createPgMockedComponent(overrides: Partial<jest.Mocked<IPgComponent>> = {}): jest.Mocked<IPgComponent> {
  return {
    query: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    streamQuery: jest.fn(),
    withTransaction: jest.fn(),
    withAsyncContextTransaction: jest.fn(),
    getPool: jest.fn(),
    ...overrides
  } as unknown as jest.Mocked<IPgComponent>
}
