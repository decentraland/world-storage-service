import type { IPlacesComponent } from '../../../src/adapters/places/types'

export function createPlacesMockedComponent(): jest.Mocked<IPlacesComponent> {
  return {
    resolvePlaceId: jest.fn()
  }
}
