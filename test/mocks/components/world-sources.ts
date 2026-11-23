import type { IWorldSourcesComponent } from '../../../src/adapters/world-sources/types'

export function createWorldSourcesMockedComponent(): jest.Mocked<IWorldSourcesComponent> {
  return {
    recordDeployment: jest.fn().mockResolvedValue(undefined),
    getSource: jest.fn().mockResolvedValue(null),
    removeIfSource: jest.fn().mockResolvedValue(undefined)
  }
}
