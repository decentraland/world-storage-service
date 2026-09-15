import { NotAuthorizedError } from '@dcl/http-commons'
import { deletePlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/delete-player-storage'
import { getPlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/get-player-storage'
import { getPlayerUsageHandler } from '../../../src/controllers/handlers/player-storage/get-player-usage'
import { listPlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/list-player-storage'
import { listPlayersHandler } from '../../../src/controllers/handlers/player-storage/list-players'
import { upsertPlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/upsert-player-storage'
import { deleteWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/delete-world-storage'
import { getWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/get-world-storage'
import { getWorldUsageHandler } from '../../../src/controllers/handlers/world-storage/get-world-usage'
import { listWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/list-world-storage'
import { upsertWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/upsert-world-storage'
import { setupRouter } from '../../../src/controllers/routes'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { createLogsMockedComponent } from '../../mocks/components'
import { buildTestContext } from '../utils/context'
import type { WorldScene } from '../../../src/adapters/worlds-content-server/types'
import type { BaseComponents, GlobalContext } from '../../../src/types'
import type { TestContext } from '../utils/context'

jest.mock('../../../src/controllers/handlers/world-storage/get-world-usage', () => ({
  getWorldUsageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/get-player-usage', () => ({
  getPlayerUsageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/world-storage/list-world-storage', () => ({
  listWorldStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/world-storage/get-world-storage', () => ({
  getWorldStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/world-storage/upsert-world-storage', () => ({
  upsertWorldStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/world-storage/delete-world-storage', () => ({
  deleteWorldStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/list-players', () => ({
  listPlayersHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/list-player-storage', () => ({
  listPlayerStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/get-player-storage', () => ({
  getPlayerStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/upsert-player-storage', () => ({
  upsertPlayerStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/delete-player-storage', () => ({
  deletePlayerStorageHandler: jest.fn()
}))

interface RouterLayer {
  path: string
  methods: string[]
  stack: Array<(ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>>
}

interface RouterWithStack {
  stack: RouterLayer[]
}

const HANDLER_RESPONSE = { status: 200, body: { value: 'from-handler' } }

const LOGS_ACCESSIBLE_SCENE: WorldScene = {
  sceneId: 'bafkrei-logs-scene',
  base: PARCELS.DEFAULT,
  parcels: [PARCELS.DEFAULT],
  title: 'Test scene',
  deployedAt: 0,
  logsPermissions: [ADDRESSES.UNAUTHORIZED]
}

const LOGS_ACCESS_ROUTES: Array<{ method: string; path: string; handler: jest.Mock }> = [
  { method: 'GET', path: '/usage/world', handler: getWorldUsageHandler as jest.Mock },
  { method: 'GET', path: '/usage/players/:player_address', handler: getPlayerUsageHandler as jest.Mock },
  { method: 'GET', path: '/values', handler: listWorldStorageHandler as jest.Mock },
  { method: 'GET', path: '/values/:key', handler: getWorldStorageHandler as jest.Mock },
  { method: 'PUT', path: '/values/:key', handler: upsertWorldStorageHandler as jest.Mock },
  { method: 'DELETE', path: '/values/:key', handler: deleteWorldStorageHandler as jest.Mock },
  { method: 'GET', path: '/players', handler: listPlayersHandler as jest.Mock },
  { method: 'GET', path: '/players/:player_address/values', handler: listPlayerStorageHandler as jest.Mock },
  { method: 'GET', path: '/players/:player_address/values/:key', handler: getPlayerStorageHandler as jest.Mock },
  { method: 'PUT', path: '/players/:player_address/values/:key', handler: upsertPlayerStorageHandler as jest.Mock },
  { method: 'DELETE', path: '/players/:player_address/values/:key', handler: deletePlayerStorageHandler as jest.Mock }
]

const DENY_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'DELETE', path: '/values' },
  { method: 'DELETE', path: '/players/:player_address/values' },
  { method: 'DELETE', path: '/players' },
  { method: 'GET', path: '/usage/env' },
  { method: 'GET', path: '/env' },
  { method: 'GET', path: '/env/:key' },
  { method: 'PUT', path: '/env/:key' },
  { method: 'DELETE', path: '/env/:key' },
  { method: 'DELETE', path: '/env' }
]

function getRouteHandler(
  router: RouterWithStack,
  method: string,
  path: string
): (ctx: unknown, next: () => Promise<unknown>) => Promise<unknown> {
  const layer = router.stack.find(candidate => candidate.path === path && candidate.methods.includes(method))
  if (!layer) {
    throw new Error(`No route registered for ${method} ${path}`)
  }
  return layer.stack[0]
}

describe('Route authorization policy', () => {
  const terminalNext = jest.fn()
  let router: RouterWithStack
  let hasWorldPermissionMock: jest.Mock
  let getLogsAccessibleSceneMock: jest.Mock

  function buildRouteCtx(method: string): TestContext {
    return buildTestContext({
      worldName: WORLD_NAMES.DEFAULT,
      parcel: PARCELS.DEFAULT,
      verification: { auth: ADDRESSES.UNAUTHORIZED, authMetadata: {} },
      request: new Request('http://localhost/route-under-test', {
        method,
        headers: method === 'PUT' ? { 'content-length': '10' } : {}
      }),
      components: {
        config: { getString: jest.fn() },
        logs: createLogsMockedComponent(),
        worldPermission: {
          hasWorldPermission: hasWorldPermissionMock,
          getLogsAccessibleScene: getLogsAccessibleSceneMock
        },
        sceneCollaborators: { touch: jest.fn().mockResolvedValue(undefined) }
      } as unknown as BaseComponents
    })
  }

  beforeEach(async () => {
    hasWorldPermissionMock = jest.fn().mockResolvedValue(false)
    getLogsAccessibleSceneMock = jest.fn().mockResolvedValue(LOGS_ACCESSIBLE_SCENE)

    const globalContext = {
      components: {
        fetcher: {},
        schemaValidator: {
          withSchemaValidatorMiddleware: jest.fn(() => (_ctx: unknown, next: () => Promise<unknown>) => next())
        },
        storageLimits: {
          limits: {
            world: { maxValueSizeBytes: 1_000_000 },
            player: { maxValueSizeBytes: 1_000_000 },
            env: { maxValueSizeBytes: 1_000_000 }
          }
        }
      } as unknown as BaseComponents
    } as GlobalContext

    router = (await setupRouter(globalContext)) as unknown as RouterWithStack

    for (const route of LOGS_ACCESS_ROUTES) {
      route.handler.mockReset().mockResolvedValue(HANDLER_RESPONSE)
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when a logsPermissions wallet requests a Scene/Player read or per-key write route', () => {
    it.each(LOGS_ACCESS_ROUTES)(
      'should grant access on $method $path via getLogsAccessibleScene',
      async ({ method, path, handler }) => {
        const handlerFn = getRouteHandler(router, method, path)
        const result = await handlerFn(buildRouteCtx(method), terminalNext)

        expect(getLogsAccessibleSceneMock).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          ADDRESSES.UNAUTHORIZED.toLowerCase(),
          PARCELS.DEFAULT
        )
        expect(handler).toHaveBeenCalled()
        expect(result).toEqual(HANDLER_RESPONSE)
      }
    )
  })

  describe('when a logsPermissions wallet requests a bulk clear-all or /env route', () => {
    it.each(DENY_ROUTES)(
      'should deny access on $method $path without consulting getLogsAccessibleScene',
      async ({ method, path }) => {
        const handlerFn = getRouteHandler(router, method, path)

        await expect(handlerFn(buildRouteCtx(method), terminalNext)).rejects.toThrow(NotAuthorizedError)
        expect(getLogsAccessibleSceneMock).not.toHaveBeenCalled()
      }
    )
  })
})
