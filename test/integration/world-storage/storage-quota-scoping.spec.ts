import { StorageLimitExceededError } from '../../../src/logic/storage-limits'
import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'

test('when computing storage size info across scenes', function ({ components }) {
  const SHARED_KEY = 'shared-key'

  describe('and the same key exists in two scenes of a .dcl.eth world', () => {
    beforeEach(async () => {
      // '"0123456789"' -> 12 bytes, '"ab"' -> 4 bytes
      await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, SHARED_KEY, '"0123456789"')
      await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B, SHARED_KEY, '"ab"')
    })

    afterEach(async () => {
      await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
      await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B)
    })

    it('should credit only the row of the scene being written, with the total spanning the world', async () => {
      const sizeInfo = await components.worldStorage.getSizeInfo(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B, SHARED_KEY)

      expect(sizeInfo).toEqual({ existingValueSize: 4, totalSize: 16 })
    })
  })

  describe('and two scenes belong to a shared Genesis City realm', () => {
    const GENESIS_REALM = 'main'

    beforeEach(async () => {
      await components.worldStorage.setValue(GENESIS_REALM, PLACE_IDS.SCENE_A, SHARED_KEY, '"0123456789"')
      await components.worldStorage.setValue(GENESIS_REALM, PLACE_IDS.SCENE_B, SHARED_KEY, '"ab"')
    })

    afterEach(async () => {
      await components.worldStorage.deleteAll(GENESIS_REALM, PLACE_IDS.SCENE_A)
      await components.worldStorage.deleteAll(GENESIS_REALM, PLACE_IDS.SCENE_B)
    })

    it('should scope the total to the place so unrelated scenes do not share a quota pool', async () => {
      const sizeInfo = await components.worldStorage.getSizeInfo(GENESIS_REALM, PLACE_IDS.SCENE_A, SHARED_KEY)

      expect(sizeInfo).toEqual({ existingValueSize: 12, totalSize: 12 })
    })
  })
})

test('when two upserts race for the remaining quota', function ({ components }) {
  const PLAYER_TOTAL_LIMIT_BYTES = 1048576
  const CONTENDING_VALUE_LENGTH = 99000

  beforeEach(async () => {
    // Seed directly through the adapter (bypassing limits validation) so that exactly one
    // more contending value fits under the per-player total.
    const seedLength = PLAYER_TOTAL_LIMIT_BYTES - (CONTENDING_VALUE_LENGTH + 2) - 100
    await components.playerStorage.setValue(
      WORLD_NAMES.DEFAULT,
      PLACE_IDS.DEFAULT,
      ADDRESSES.PLAYER,
      'seed',
      JSON.stringify('a'.repeat(seedLength - 2))
    )
  })

  afterEach(async () => {
    await components.playerStorage.deleteAllForPlayer(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, ADDRESSES.PLAYER)
  })

  it('should let exactly one writer through and reject the other with a storage limit error', async () => {
    const value = 'b'.repeat(CONTENDING_VALUE_LENGTH)

    const results = await Promise.allSettled([
      components.storageOperations.upsertPlayerValue(
        WORLD_NAMES.DEFAULT,
        PLACE_IDS.DEFAULT,
        ADDRESSES.PLAYER,
        'contender-1',
        value
      ),
      components.storageOperations.upsertPlayerValue(
        WORLD_NAMES.DEFAULT,
        PLACE_IDS.DEFAULT,
        ADDRESSES.PLAYER,
        'contender-2',
        value
      )
    ])

    const fulfilled = results.filter(result => result.status === 'fulfilled')
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(StorageLimitExceededError)
  })
})
