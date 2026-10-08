import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of iterable) {
    items.push(item)
  }
  return items
}

function parseValues<T extends { value: string }>(rows: T[]): Array<Omit<T, 'value'> & { value: unknown }> {
  return rows.map(row => ({ ...row, value: JSON.parse(row.value) }))
}

test('when streaming the values of a scene', function ({ components }) {
  const EMPTY_PLACE_ID = '00000000-0000-4000-8000-000000000000'

  beforeEach(async () => {
    await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, 'b', '{"n":2}')
    await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, 'a', '"first"')
    await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B, 'a', '"other-scene"')

    await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.PLAYER, 'k2', '2')
    await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.PLAYER, 'k1', '1')
    await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.OWNER, 'k2', '{"o":2}')
    await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.OWNER, 'k1', '{"o":1}')
    await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B, ADDRESSES.PLAYER, 'k1', '"other"')
  })

  afterEach(async () => {
    await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
    await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B)
    await components.playerStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
    await components.playerStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B)
  })

  describe('and the world values are streamed without a key filter', () => {
    it('should yield only the scene rows ordered by key with their stored values', async () => {
      const rows = await collect(
        components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, null)
      )

      expect(parseValues(rows)).toEqual([
        { key: 'a', value: 'first' },
        { key: 'b', value: { n: 2 } }
      ])
    })
  })

  describe('and the world values are streamed for one key', () => {
    it('should yield only that key', async () => {
      const rows = await collect(
        components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ['b'])
      )

      expect(parseValues(rows)).toEqual([{ key: 'b', value: { n: 2 } }])
    })
  })

  describe('and the world values are streamed for an empty key list', () => {
    it('should yield nothing', async () => {
      const rows = await collect(components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, []))

      expect(rows).toEqual([])
    })
  })

  describe('and the player values are streamed without filters', () => {
    it('should yield only the scene rows ordered by player address then key', async () => {
      const rows = await collect(
        components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, {
          addresses: null,
          keys: null
        })
      )

      expect(parseValues(rows)).toEqual([
        { player_address: ADDRESSES.PLAYER, key: 'k1', value: 1 },
        { player_address: ADDRESSES.PLAYER, key: 'k2', value: 2 },
        { player_address: ADDRESSES.OWNER, key: 'k1', value: { o: 1 } },
        { player_address: ADDRESSES.OWNER, key: 'k2', value: { o: 2 } }
      ])
    })
  })

  describe('and the player values are streamed for one address', () => {
    it('should yield only that player rows', async () => {
      const rows = await collect(
        components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, {
          addresses: [ADDRESSES.OWNER],
          keys: null
        })
      )

      expect(parseValues(rows)).toEqual([
        { player_address: ADDRESSES.OWNER, key: 'k1', value: { o: 1 } },
        { player_address: ADDRESSES.OWNER, key: 'k2', value: { o: 2 } }
      ])
    })
  })

  describe('and the player values are streamed for one key', () => {
    it('should yield that key for every player of the scene', async () => {
      const rows = await collect(
        components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, {
          addresses: null,
          keys: ['k2']
        })
      )

      expect(parseValues(rows)).toEqual([
        { player_address: ADDRESSES.PLAYER, key: 'k2', value: 2 },
        { player_address: ADDRESSES.OWNER, key: 'k2', value: { o: 2 } }
      ])
    })
  })

  describe('and the scene has no stored values', () => {
    it('should yield no world rows', async () => {
      const rows = await collect(components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, EMPTY_PLACE_ID, null))

      expect(rows).toEqual([])
    })

    it('should yield no player rows', async () => {
      const rows = await collect(
        components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, EMPTY_PLACE_ID, {
          addresses: null,
          keys: null
        })
      )

      expect(rows).toEqual([])
    })
  })
})
