import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'

async function collect<T>(rows: AsyncGenerator<T>): Promise<T[]> {
  const collected: T[] = []
  for await (const row of rows) {
    collected.push(row)
  }
  return collected
}

test('when streaming all values of a scene', function ({ components }) {
  describe('and the world storage has rows in the scene and in another scene', () => {
    let yielded: Array<{ key: string; value: string }>

    beforeEach(async () => {
      await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, 'b', '"second"')
      await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, 'a', '{"n":1}')
      await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B, 'other', '"other-scene"')

      yielded = await collect(components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A))
    })

    afterEach(async () => {
      await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
      await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B)
    })

    it('should yield only the scene rows ordered by key with values as JSON text', () => {
      expect(yielded).toEqual([
        { key: 'a', value: '{"n": 1}' },
        { key: 'b', value: '"second"' }
      ])
    })
  })

  describe('and the player storage has rows in the scene and in another scene', () => {
    let yielded: Array<{ player_address: string; key: string; value: string }>

    beforeEach(async () => {
      await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.OWNER, 'a', '"owner-a"')
      await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.PLAYER, 'b', '2')
      await components.playerStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, ADDRESSES.PLAYER, 'a', '{"n":1}')
      await components.playerStorage.setValue(
        WORLD_NAMES.DEFAULT,
        PLACE_IDS.SCENE_B,
        ADDRESSES.PLAYER,
        'other',
        '"other-scene"'
      )

      yielded = await collect(components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A))
    })

    afterEach(async () => {
      await components.playerStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
      await components.playerStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_B)
    })

    it('should yield only the scene rows ordered by player address then key', () => {
      expect(yielded).toEqual([
        { player_address: ADDRESSES.PLAYER, key: 'a', value: '{"n": 1}' },
        { player_address: ADDRESSES.PLAYER, key: 'b', value: '2' },
        { player_address: ADDRESSES.OWNER, key: 'a', value: '"owner-a"' }
      ])
    })
  })

  describe('and the scene has no stored rows', () => {
    let worldRows: Array<{ key: string; value: string }>
    let playerRows: Array<{ player_address: string; key: string; value: string }>

    beforeEach(async () => {
      worldRows = await collect(components.worldStorage.streamSceneValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A))
      playerRows = await collect(
        components.playerStorage.streamScenePlayerValues(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
      )
    })

    it('should yield no world rows', () => {
      expect(worldRows).toEqual([])
    })

    it('should yield no player rows', () => {
      expect(playerRows).toEqual([])
    })
  })
})
