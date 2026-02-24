import { StorageLimitExceededError, createStorageLimitsComponent } from '../../../src/logic/storage-limits'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import {
  createEnvStorageMockedComponent,
  createLogsMockedComponent,
  createPlayerStorageMockedComponent,
  createWorldStorageMockedComponent
} from '../../mocks/components'
import type { IEnvStorageComponent } from '../../../src/adapters/env-storage/types'
import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'
import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'
import type { IStorageLimitsComponent } from '../../../src/logic/storage-limits/types'
import type { AppComponents } from '../../../src/types'

const DEFAULT_CONFIG: Record<string, number> = {
  ENV_STORAGE_MAX_VALUE_SIZE_BYTES: 10240,
  ENV_STORAGE_MAX_TOTAL_SIZE_BYTES: 262144,
  WORLD_STORAGE_MAX_VALUE_SIZE_BYTES: 524288,
  WORLD_STORAGE_MAX_TOTAL_SIZE_BYTES: 10485760,
  PLAYER_STORAGE_MAX_VALUE_SIZE_BYTES: 102400,
  PLAYER_STORAGE_MAX_TOTAL_SIZE_BYTES: 1048576
}

describe('Storage Limits Component', () => {
  const worldName = WORLD_NAMES.DEFAULT
  const playerAddress = ADDRESSES.PLAYER
  const key = 'test-key'

  let worldStorage: jest.Mocked<IWorldStorageComponent>
  let playerStorage: jest.Mocked<IPlayerStorageComponent>
  let envStorage: jest.Mocked<IEnvStorageComponent>

  beforeEach(() => {
    worldStorage = createWorldStorageMockedComponent()
    playerStorage = createPlayerStorageMockedComponent()
    envStorage = createEnvStorageMockedComponent()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  async function createComponent(configOverrides: Record<string, number> = {}): Promise<IStorageLimitsComponent> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...configOverrides }
    const configRequireNumber = jest.fn().mockImplementation(async (configKey: string) => {
      if (!(configKey in mergedConfig)) {
        throw new Error(`Missing required config key: ${configKey}`)
      }
      return mergedConfig[configKey]
    })

    return createStorageLimitsComponent({
      config: { requireNumber: configRequireNumber },
      logs: createLogsMockedComponent(),
      worldStorage,
      playerStorage,
      envStorage
    } as unknown as Pick<AppComponents, 'config' | 'logs' | 'worldStorage' | 'playerStorage' | 'envStorage'>)
  }

  describe('when validating world storage upserts', () => {
    let component: IStorageLimitsComponent

    beforeEach(async () => {
      component = await createComponent({
        WORLD_STORAGE_MAX_VALUE_SIZE_BYTES: 1024,
        WORLD_STORAGE_MAX_TOTAL_SIZE_BYTES: 5000
      })
    })

    describe('and the value size exceeds the maximum allowed', () => {
      let largeValue: string

      beforeEach(() => {
        largeValue = 'x'.repeat(2000)
      })

      it('should throw a StorageLimitExceededError with the limit in the message', async () => {
        const promise = component.validateWorldStorageUpsert(worldName, key, largeValue)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow(/exceeds the maximum allowed size \(1024 bytes\)/)
      })
    })

    describe('and the value size is exactly at the limit', () => {
      let value: string

      beforeEach(() => {
        // JSON.stringify adds 2 bytes for quotes, so value length + 2 <= 1024
        value = 'a'.repeat(1022)
        worldStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 0 })
      })

      it('should resolve without throwing', async () => {
        await expect(component.validateWorldStorageUpsert(worldName, key, value)).resolves.not.toThrow()
      })
    })

    describe('and the total storage size would exceed the limit for a new key', () => {
      let value: string

      beforeEach(() => {
        value = 'x'.repeat(200)
        worldStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 4900 })
      })

      it('should throw a StorageLimitExceededError about total size exceeded', async () => {
        const promise = component.validateWorldStorageUpsert(worldName, key, value)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow('Total storage size would exceed the maximum allowed')
      })
    })

    describe('and updating an existing key reduces the projected total within the limit', () => {
      beforeEach(() => {
        // current: 5000 (at limit), old: 302 bytes, new: ~7 bytes (JSON "small") -> projected: 5000 - 302 + 7 = 4705 <= 5000
        // A new key with the same value would fail: 5000 - 0 + 7 = 5007 > 5000
        worldStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 302, totalSize: 5000 })
      })

      it('should resolve without throwing because the old value size is subtracted', async () => {
        await expect(component.validateWorldStorageUpsert(worldName, key, 'small')).resolves.not.toThrow()
      })
    })

    describe('and all limits are within bounds for a new key', () => {
      beforeEach(() => {
        worldStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 100 })
      })

      it('should resolve without throwing', async () => {
        await expect(component.validateWorldStorageUpsert(worldName, key, 'hello')).resolves.not.toThrow()
      })

      it('should call getSizeInfo with the world name and key', async () => {
        await component.validateWorldStorageUpsert(worldName, key, 'hello')
        expect(worldStorage.getSizeInfo).toHaveBeenCalledWith(worldName, key)
      })
    })
  })

  describe('when validating player storage upserts', () => {
    let component: IStorageLimitsComponent

    beforeEach(async () => {
      component = await createComponent({
        PLAYER_STORAGE_MAX_VALUE_SIZE_BYTES: 512,
        PLAYER_STORAGE_MAX_TOTAL_SIZE_BYTES: 2000
      })
    })

    describe('and the value size exceeds the maximum allowed', () => {
      let largeValue: string

      beforeEach(() => {
        largeValue = 'x'.repeat(1000)
      })

      it('should throw a StorageLimitExceededError with the limit in the message', async () => {
        const promise = component.validatePlayerStorageUpsert(worldName, playerAddress, key, largeValue)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow(/exceeds the maximum allowed size \(512 bytes\)/)
      })
    })

    describe('and the value size is exactly at the limit', () => {
      let value: string

      beforeEach(() => {
        // JSON.stringify adds 2 bytes for quotes, so value length + 2 <= 512
        value = 'a'.repeat(510)
        playerStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 0 })
      })

      it('should resolve without throwing', async () => {
        await expect(component.validatePlayerStorageUpsert(worldName, playerAddress, key, value)).resolves.not.toThrow()
      })
    })

    describe('and the total storage size would exceed the limit for a new key', () => {
      let value: string

      beforeEach(() => {
        value = 'x'.repeat(200)
        playerStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 1900 })
      })

      it('should throw a StorageLimitExceededError about total size exceeded', async () => {
        const promise = component.validatePlayerStorageUpsert(worldName, playerAddress, key, value)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow('Total storage size would exceed the maximum allowed')
      })
    })

    describe('and updating an existing key reduces the projected total within the limit', () => {
      beforeEach(() => {
        // current: 2000 (at limit), old: 200 bytes, new: ~7 bytes (JSON "small") -> projected: 2000 - 200 + 7 = 1807 <= 2000
        // A new key with the same value would fail: 2000 - 0 + 7 = 2007 > 2000
        playerStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 200, totalSize: 2000 })
      })

      it('should resolve without throwing because the old value size is subtracted', async () => {
        await expect(
          component.validatePlayerStorageUpsert(worldName, playerAddress, key, 'small')
        ).resolves.not.toThrow()
      })
    })

    describe('and all limits are within bounds for a new key', () => {
      beforeEach(() => {
        playerStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 100 })
      })

      it('should resolve without throwing', async () => {
        await expect(
          component.validatePlayerStorageUpsert(worldName, playerAddress, key, 'hello')
        ).resolves.not.toThrow()
      })

      it('should call getSizeInfo with the world name, player address, and key', async () => {
        await component.validatePlayerStorageUpsert(worldName, playerAddress, key, 'hello')
        expect(playerStorage.getSizeInfo).toHaveBeenCalledWith(worldName, playerAddress, key)
      })
    })
  })

  describe('when validating env storage upserts', () => {
    let component: IStorageLimitsComponent

    beforeEach(async () => {
      component = await createComponent({
        ENV_STORAGE_MAX_VALUE_SIZE_BYTES: 100,
        ENV_STORAGE_MAX_TOTAL_SIZE_BYTES: 500
      })
    })

    describe('and the value size exceeds the maximum allowed', () => {
      let largeValue: string

      beforeEach(() => {
        largeValue = 'x'.repeat(200)
      })

      it('should throw a StorageLimitExceededError with the limit in the message', async () => {
        const promise = component.validateEnvStorageUpsert(worldName, key, largeValue)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow(/exceeds the maximum allowed size \(100 bytes\)/)
      })
    })

    describe('and the value size is exactly at the limit', () => {
      beforeEach(() => {
        envStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 0 })
      })

      it('should resolve without throwing because env values are measured as raw strings', async () => {
        // Env values are NOT JSON-serialized, so 100 bytes = exactly at the 100-byte limit
        await expect(component.validateEnvStorageUpsert(worldName, key, 'a'.repeat(100))).resolves.not.toThrow()
      })
    })

    describe('and the total storage size would exceed the limit for a new key', () => {
      let value: string

      beforeEach(() => {
        value = 'x'.repeat(60)
        envStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 450 })
      })

      it('should throw a StorageLimitExceededError about total size exceeded', async () => {
        const promise = component.validateEnvStorageUpsert(worldName, key, value)
        await expect(promise).rejects.toBeInstanceOf(StorageLimitExceededError)
        await expect(promise).rejects.toThrow('Total storage size would exceed the maximum allowed')
      })
    })

    describe('and updating an existing key reduces the projected total within the limit', () => {
      beforeEach(() => {
        // current: 500 (at limit), old: 30 bytes, new: 7 bytes ("updated") -> projected: 500 - 30 + 7 = 477 <= 500
        // A new key with the same value would fail: 500 - 0 + 7 = 507 > 500
        envStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 30, totalSize: 500 })
      })

      it('should resolve without throwing because the old value size is subtracted', async () => {
        await expect(component.validateEnvStorageUpsert(worldName, key, 'updated')).resolves.not.toThrow()
      })
    })

    describe('and all limits are within bounds for a new key', () => {
      beforeEach(() => {
        envStorage.getSizeInfo.mockResolvedValueOnce({ existingValueSize: 0, totalSize: 50 })
      })

      it('should resolve without throwing', async () => {
        await expect(component.validateEnvStorageUpsert(worldName, key, 'my-secret')).resolves.not.toThrow()
      })

      it('should call getSizeInfo with the world name and key', async () => {
        await component.validateEnvStorageUpsert(worldName, key, 'my-secret')
        expect(envStorage.getSizeInfo).toHaveBeenCalledWith(worldName, key)
      })
    })
  })
})
