import type { ICatalystContentComponent } from '../../../src/adapters/catalyst-content/types'

export function createCatalystContentMockedComponent(): jest.Mocked<ICatalystContentComponent> {
  return {
    getActiveSceneEntity: jest.fn()
  }
}
