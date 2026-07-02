import type { IPgComponent } from '@dcl/pg-component'
import { StorageLimitExceededError } from '../../../src/logic/storage-limits'
import { createStorageOperationsComponent } from '../../../src/logic/storage-operations'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import {
  createEnvStorageMockedComponent,
  createPgMockedComponent,
  createPlayerStorageMockedComponent,
  createWorldStorageMockedComponent
} from '../../mocks/components'
import type { IEnvStorageComponent } from '../../../src/adapters/env-storage/types'
import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'
import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'
import type { IStorageLimitsComponent } from '../../../src/logic/storage-limits/types'
import type { IStorageOperationsComponent } from '../../../src/logic/storage-operations'

describe('Storage Operations Component', () => {
  const GENESIS_WORLD = 'main'
  const KEY = 'state'

  let pg: jest.Mocked<IPgComponent>
  let worldStorage: jest.Mocked<IWorldStorageComponent>
  let playerStorage: jest.Mocked<IPlayerStorageComponent>
  let envStorage: jest.Mocked<IEnvStorageComponent>
  let storageLimits: jest.Mocked<IStorageLimitsComponent>
  let storageOperations: IStorageOperationsComponent

  beforeEach(async () => {
    pg = createPgMockedComponent()
    // Run the transaction callback inline: the orchestration under test only relies on
    // the callback being executed and its result being returned.
    pg.withAsyncContextTransaction.mockImplementation(async callback => callback())
    pg.query.mockResolvedValue({ rows: [], rowCount: 0, notices: [] } as never)
    worldStorage = createWorldStorageMockedComponent()
    playerStorage = createPlayerStorageMockedComponent()
    envStorage = createEnvStorageMockedComponent()
    storageLimits = {
      limits: {
        env: { maxValueSizeBytes: 1, maxTotalSizeBytes: 1 },
        world: { maxValueSizeBytes: 1, maxTotalSizeBytes: 1 },
        player: { maxValueSizeBytes: 1, maxTotalSizeBytes: 1 }
      },
      validateWorldStorageUpsert: jest.fn(),
      validatePlayerStorageUpsert: jest.fn(),
      validateEnvStorageUpsert: jest.fn()
    } as unknown as jest.Mocked<IStorageLimitsComponent>
    storageOperations = await createStorageOperationsComponent({
      pg,
      storageLimits,
      worldStorage,
      playerStorage,
      envStorage
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when upserting a world value', () => {
    describe('and the validation passes', () => {
      let serializedValue: string
      let result: string

      beforeEach(async () => {
        serializedValue = '{"foo":"bar"}'
        ;(storageLimits.validateWorldStorageUpsert as jest.Mock).mockResolvedValueOnce(serializedValue)
        result = await storageOperations.upsertWorldValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, { foo: 'bar' })
      })

      it('should run the validation and the write inside the transaction', () => {
        expect(pg.withAsyncContextTransaction).toHaveBeenCalledTimes(1)
        expect(storageLimits.validateWorldStorageUpsert).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          PLACE_IDS.DEFAULT,
          KEY,
          { foo: 'bar' }
        )
        expect(worldStorage.setValue).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, serializedValue)
      })

      it('should take an advisory lock scoped to the world', () => {
        const lockStatement = pg.query.mock.calls[0][0] as { text: string; values: unknown[] }
        expect(lockStatement.text).toContain('pg_advisory_xact_lock')
        expect(lockStatement.values[0]).toBe(`world-storage:${WORLD_NAMES.DEFAULT}`)
      })

      it('should invalidate the cached value after the commit', () => {
        expect(worldStorage.invalidateValue).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY)
      })

      it('should return the serialized value', () => {
        expect(result).toBe(serializedValue)
      })
    })

    describe('and the scene belongs to a shared Genesis City realm', () => {
      beforeEach(async () => {
        ;(storageLimits.validateWorldStorageUpsert as jest.Mock).mockResolvedValueOnce('1')
        await storageOperations.upsertWorldValue(GENESIS_WORLD, PLACE_IDS.SCENE_A, KEY, 1)
      })

      it('should take an advisory lock scoped to the place instead of the whole realm', () => {
        const lockStatement = pg.query.mock.calls[0][0] as { text: string; values: unknown[] }
        expect(lockStatement.values[0]).toBe(`world-storage:${GENESIS_WORLD}:${PLACE_IDS.SCENE_A}`)
      })
    })

    describe('and the validation rejects', () => {
      let validationError: StorageLimitExceededError

      beforeEach(() => {
        validationError = new StorageLimitExceededError('limit exceeded')
        ;(storageLimits.validateWorldStorageUpsert as jest.Mock).mockRejectedValueOnce(validationError)
      })

      it('should reject with the validation error and not write or invalidate anything', async () => {
        await expect(
          storageOperations.upsertWorldValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 1)
        ).rejects.toThrow(validationError)
        expect(worldStorage.setValue).not.toHaveBeenCalled()
        expect(worldStorage.invalidateValue).not.toHaveBeenCalled()
      })
    })

    describe('and the write fails', () => {
      beforeEach(() => {
        ;(storageLimits.validateWorldStorageUpsert as jest.Mock).mockResolvedValueOnce('1')
        worldStorage.setValue.mockRejectedValueOnce(new Error('db error'))
      })

      it('should reject without invalidating the cache after a failed write', async () => {
        await expect(
          storageOperations.upsertWorldValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 1)
        ).rejects.toThrow('db error')
        expect(worldStorage.invalidateValue).not.toHaveBeenCalled()
      })
    })
  })

  describe('when upserting a player value', () => {
    describe('and the validation passes', () => {
      let serializedValue: string
      let result: string

      beforeEach(async () => {
        serializedValue = '42'
        ;(storageLimits.validatePlayerStorageUpsert as jest.Mock).mockResolvedValueOnce(serializedValue)
        result = await storageOperations.upsertPlayerValue(
          WORLD_NAMES.DEFAULT,
          PLACE_IDS.DEFAULT,
          ADDRESSES.PLAYER,
          KEY,
          42
        )
      })

      it('should take an advisory lock scoped to the world and player', () => {
        const lockStatement = pg.query.mock.calls[0][0] as { text: string; values: unknown[] }
        expect(lockStatement.values[0]).toBe(`player-storage:${WORLD_NAMES.DEFAULT}:${ADDRESSES.PLAYER}`)
      })

      it('should write the value and then invalidate the cached entry after commit', () => {
        expect(playerStorage.setValue).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          PLACE_IDS.DEFAULT,
          ADDRESSES.PLAYER,
          KEY,
          serializedValue
        )
        expect(playerStorage.invalidateValue).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          PLACE_IDS.DEFAULT,
          ADDRESSES.PLAYER,
          KEY
        )
      })

      it('should return the serialized value', () => {
        expect(result).toBe(serializedValue)
      })
    })
  })

  describe('when upserting an env value', () => {
    describe('and the validation passes', () => {
      beforeEach(async () => {
        ;(storageLimits.validateEnvStorageUpsert as jest.Mock).mockResolvedValueOnce(undefined)
        await storageOperations.upsertEnvValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 'secret')
      })

      it('should take an advisory lock scoped to the world', () => {
        const lockStatement = pg.query.mock.calls[0][0] as { text: string; values: unknown[] }
        expect(lockStatement.values[0]).toBe(`env-storage:${WORLD_NAMES.DEFAULT}`)
      })

      it('should validate and write inside the transaction', () => {
        expect(storageLimits.validateEnvStorageUpsert).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          PLACE_IDS.DEFAULT,
          KEY,
          'secret'
        )
        expect(envStorage.setValue).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 'secret')
      })
    })
  })
})
