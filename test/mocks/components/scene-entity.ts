import { createSceneEntityComponent } from '../../../src/logic/scene-entity'
import type { ISceneEntityComponent } from '../../../src/logic/scene-entity/types'

export async function createSceneEntityMockedComponent(): Promise<jest.Mocked<ISceneEntityComponent>> {
  const sceneEntity = await createSceneEntityComponent()

  return {
    mapSceneEntity: jest.fn(sceneEntity.mapSceneEntity),
    normalizeTitle: jest.fn(sceneEntity.normalizeTitle),
    extractLogsPermissions: jest.fn(sceneEntity.extractLogsPermissions)
  }
}
