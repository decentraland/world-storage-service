import { createConfigComponent } from '@well-known-components/env-config-provider'
import type { IFetchComponent } from '@dcl/core-commons'
import { createFetchMockedComponent } from '@dcl/core-commons'
import type { IQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { Events } from '@dcl/schemas'
import { createDeploymentConsumerComponent } from '../../../src/adapters/deployment-consumer'
import { test } from '../../components'
import { ADDRESSES } from '../../fixtures'

type MessageHandler = (event: unknown) => Promise<void>

const DEFAULT_URL = 'https://worlds-content-server.decentraland.org'
const OTHER_URL = 'https://worlds-content-server.dcl.dev'
const WORLD_NAME = 'source-scoping.dcl.eth'

test('when world events from two worlds servers are ingested', function ({ components }) {
  let handlers: Map<string, MessageHandler>
  let fetcher: jest.Mocked<IFetchComponent>
  let address: string

  function handler(subType: string): MessageHandler {
    const found = handlers.get(`${Events.Type.WORLD}:${subType}`)
    if (!found) throw new Error(`${subType} handler was not registered`)
    return found
  }

  function mockEntity(base: string, deployedAt: number): void {
    fetcher.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        type: 'scene',
        timestamp: deployedAt,
        pointers: [base],
        metadata: {
          worldConfiguration: { name: WORLD_NAME },
          scene: { base, parcels: [base] },
          display: { title: `scene at ${base}` },
          logsPermissions: [address]
        }
      })
    } as unknown as Response)
  }

  async function listSceneIds(): Promise<string[]> {
    const { data } = await components.sceneCollaborators.listByAddress(address, 50, 0)
    return data
      .filter(scene => scene.worldName === WORLD_NAME)
      .map(scene => scene.sceneId)
      .sort()
  }

  async function cleanUp(): Promise<void> {
    await components.sceneCollaborators.removeByWorld(WORLD_NAME, null)
    await components.sceneCollaborators.removeByWorld(WORLD_NAME, OTHER_URL)
    await components.worldSources.removeIfSource(WORLD_NAME, null)
    await components.worldSources.removeIfSource(WORLD_NAME, OTHER_URL)
  }

  beforeEach(async () => {
    address = ADDRESSES.AUTHORIZED.toLowerCase()
    handlers = new Map()
    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    const queueConsumer = {
      addMessageHandler: jest.fn((type: string, subType: string, registered: MessageHandler) => {
        handlers.set(`${type}:${subType}`, registered)
      }),
      removeMessageHandler: jest.fn()
    } as unknown as IQueueConsumerComponent

    await createDeploymentConsumerComponent({
      config: createConfigComponent({
        WORLDS_CONTENT_SERVER_URL: DEFAULT_URL,
        CONTENT_URL: 'https://peer.decentraland.org/content',
        ALLOWED_WORLDS_CONTENT_SERVER_HOSTS: 'worlds-content-server.dcl.dev'
      }),
      logs: components.logs,
      metrics: components.metrics,
      fetcher,
      queueConsumer,
      sceneCollaborators: components.sceneCollaborators,
      sceneEntity: components.sceneEntity,
      worldSources: components.worldSources
    })

    await cleanUp()

    mockEntity('0,0', 100)
    await handler(Events.SubType.Worlds.DEPLOYMENT)({
      entity: { entityId: 'scene-from-default' },
      contentServerUrls: [DEFAULT_URL],
      __messageAttributes: { sourceContentServerUrl: DEFAULT_URL }
    })
    mockEntity('1,1', 200)
    await handler(Events.SubType.Worlds.DEPLOYMENT)({
      entity: { entityId: 'scene-from-other' },
      contentServerUrls: [OTHER_URL],
      __messageAttributes: { sourceContentServerUrl: OTHER_URL }
    })
  })

  afterEach(async () => {
    await cleanUp()
    jest.resetAllMocks()
  })

  describe('and the other server undeploys the world', () => {
    beforeEach(async () => {
      await handler(Events.SubType.Worlds.WORLD_UNDEPLOYMENT)({
        metadata: { worldName: WORLD_NAME },
        __messageAttributes: { sourceContentServerUrl: OTHER_URL }
      })
    })

    it('should keep the scene deployed by the default server', async () => {
      expect(await listSceneIds()).toEqual(['scene-from-default'])
    })
  })

  describe('and the default server undeploys the world without a source attribute', () => {
    beforeEach(async () => {
      await handler(Events.SubType.Worlds.WORLD_UNDEPLOYMENT)({ metadata: { worldName: WORLD_NAME } })
    })

    it('should keep the scene deployed by the other server', async () => {
      expect(await listSceneIds()).toEqual(['scene-from-other'])
    })

    it('should keep the world source recorded by the other server', async () => {
      expect(await components.worldSources.getSource(WORLD_NAME)).toBe(OTHER_URL)
    })
  })

  describe('and the other server undeploys a scene the default server deployed', () => {
    beforeEach(async () => {
      await handler(Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT)({
        metadata: { worldName: WORLD_NAME, scenes: [{ entityId: 'scene-from-default' }] },
        __messageAttributes: { sourceContentServerUrl: OTHER_URL }
      })
    })

    it('should leave both scenes indexed', async () => {
      expect(await listSceneIds()).toEqual(['scene-from-default', 'scene-from-other'])
    })
  })

  describe('and an undeployment names a non-allowlisted source', () => {
    beforeEach(async () => {
      await handler(Events.SubType.Worlds.WORLD_UNDEPLOYMENT)({
        metadata: { worldName: WORLD_NAME },
        __messageAttributes: { sourceContentServerUrl: 'https://attacker.example.com' }
      })
    })

    it('should drop it and keep every scene', async () => {
      expect(await listSceneIds()).toEqual(['scene-from-default', 'scene-from-other'])
    })
  })

  describe('and the other server deploys a newer scene at the default server scene parcel', () => {
    beforeEach(async () => {
      mockEntity('0,0', 300)
      await handler(Events.SubType.Worlds.DEPLOYMENT)({
        entity: { entityId: 'scene-from-other-at-origin' },
        contentServerUrls: [OTHER_URL],
        __messageAttributes: { sourceContentServerUrl: OTHER_URL }
      })
    })

    it('should keep the default server scene at that parcel', async () => {
      expect(await listSceneIds()).toEqual(['scene-from-default', 'scene-from-other', 'scene-from-other-at-origin'])
    })
  })

  describe('and the world source is looked up', () => {
    it('should be the server of the latest deployment', async () => {
      expect(await components.worldSources.getSource(WORLD_NAME)).toBe(OTHER_URL)
    })
  })
})
