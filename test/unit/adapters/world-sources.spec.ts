import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createConfigMockedComponent } from '@dcl/core-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createWorldSourcesComponent } from '../../../src/adapters/world-sources'
import { createCacheMockedComponent, createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type { IWorldSourcesComponent } from '../../../src/adapters/world-sources'

describe('WorldSourcesComponent', () => {
  const sourceUrl = 'https://worlds-content-server.dcl.dev'
  let pg: jest.Mocked<IPgComponent>
  let cache: jest.Mocked<ICacheStorageComponent>
  let worldSources: IWorldSourcesComponent

  beforeEach(async () => {
    pg = createPgMockedComponent()
    pg.query.mockResolvedValue({ rows: [] } as never)
    cache = createCacheMockedComponent()
    cache.get.mockResolvedValue(null)
    worldSources = await createWorldSourcesComponent({
      pg,
      cache,
      config: createConfigMockedComponent({ getNumber: jest.fn().mockResolvedValue(undefined) }),
      logs: createLogsMockedComponent()
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when recording a deployment', () => {
    it('should upsert the source only over an older or equal deployment', async () => {
      await worldSources.recordDeployment('MyWorld.dcl.eth', sourceUrl, 100)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toContain('WHERE world_sources.deployed_at <= EXCLUDED.deployed_at')
      expect(statement.values).toEqual(['myworld.dcl.eth', sourceUrl, 100])
    })

    it('should invalidate the cached source', async () => {
      await worldSources.recordDeployment('MyWorld.dcl.eth', sourceUrl, 100)
      expect(cache.remove).toHaveBeenCalledWith('world-source:myworld.dcl.eth')
    })
  })

  describe('when getting a source', () => {
    describe('and the world has a recorded source', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ source_content_server_url: sourceUrl }] } as never)
      })

      it('should return the recorded source', async () => {
        expect(await worldSources.getSource('myworld.dcl.eth')).toBe(sourceUrl)
      })
    })

    describe('and the world is unknown', () => {
      it('should return null so the default server is used', async () => {
        expect(await worldSources.getSource('myworld.dcl.eth')).toBeNull()
      })
    })

    describe('and the default source is cached', () => {
      beforeEach(() => {
        cache.get.mockResolvedValueOnce('')
      })

      it('should return null without querying the database', async () => {
        expect(await worldSources.getSource('myworld.dcl.eth')).toBeNull()
        expect(pg.query).not.toHaveBeenCalled()
      })
    })
  })

  describe('when removing a source', () => {
    it('should delete the world source only when it matches', async () => {
      await worldSources.removeIfSource('myworld.dcl.eth', null)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toContain('source_content_server_url IS NOT DISTINCT FROM')
      expect(statement.values).toEqual(['myworld.dcl.eth', null])
    })
  })
})
