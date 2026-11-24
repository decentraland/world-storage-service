import type { IMetricsComponent } from '@well-known-components/interfaces'
import type { metricDeclarations } from '../../../src/metrics'

export function createMetricsMockedComponent(): jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>> {
  return {
    startTimer: jest.fn().mockReturnValue({ end: jest.fn() }),
    observe: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    getValue: jest.fn(),
    reset: jest.fn(),
    resetAll: jest.fn()
  }
}
