import type { IExportJobsComponent } from '../../../src/adapters/export-jobs/types'

export function createExportJobsMockedComponent(): jest.Mocked<IExportJobsComponent> {
  return {
    create: jest.fn(),
    getForScene: jest.fn(),
    listForScene: jest.fn(),
    streamContent: jest.fn(),
    claimNext: jest.fn(),
    markDone: jest.fn(),
    markFailed: jest.fn(),
    failStale: jest.fn(),
    deleteExpired: jest.fn()
  }
}
