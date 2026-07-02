import { test } from '../../components'
import { PLACE_IDS, WORLD_NAMES } from '../../fixtures'

test('when re-upserting a value that is already cached', function ({ components }) {
  const KEY = 'cache-coherence-key'

  afterEach(async () => {
    await components.worldStorage.deleteValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY)
  })

  describe('and the previous value has been read into the cache', () => {
    beforeEach(async () => {
      await components.storageOperations.upsertWorldValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 'first')
      // Populate the read-through cache with the current value.
      await components.worldStorage.getValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY)
    })

    it('should return the newly committed value on the next read, not the cached previous one', async () => {
      await components.storageOperations.upsertWorldValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY, 'second')

      const value = await components.worldStorage.getValue(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, KEY)

      expect(value).toBe('"second"')
    })
  })
})
