import { NotAuthorizedError } from '@dcl/http-commons'
import { getPlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/get-player-storage'
import { getPlayerUsageHandler } from '../../../src/controllers/handlers/player-storage/get-player-usage'
import { listPlayerStorageHandler } from '../../../src/controllers/handlers/player-storage/list-player-storage'
import { listPlayersHandler } from '../../../src/controllers/handlers/player-storage/list-players'
import { getWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/get-world-storage'
import { getWorldUsageHandler } from '../../../src/controllers/handlers/world-storage/get-world-usage'
import { listWorldStorageHandler } from '../../../src/controllers/handlers/world-storage/list-world-storage'
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
jest.mock('../../../src/controllers/handlers/player-storage/list-players', () => ({
  listPlayersHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/list-player-storage', () => ({
  listPlayerStorageHandler: jest.fn()
}))
jest.mock('../../../src/controllers/handlers/player-storage/get-player-storage', () => ({
  getPlayerStorageHandler: jest.fn()
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

const LOGS_READABLE_SCENE: WorldScene = {
  sceneId: 'bafkrei-logs-scene',
  base: PARCELS.DEFAULT,
  parcels: [PARCELS.DEFAULT],
  title: 'Test scene',
  logsPermissions: [ADDRESSES.UNAUTHORIZED]
}

const READ_ROUTES: Array<{ method: string; path: string; handler: jest.Mock }> = [
  { method: 'GET', path: '/usage/world', handler: getWorldUsageHandler as jest.Mock },
  { method: 'GET', path: '/usage/players/:player_address', handler: getPlayerUsageHandler as jest.Mock },
  { method: 'GET', path: '/values', handler: listWorldStorageHandler as jest.Mock },
  { method: 'GET', path: '/values/:key', handler: getWorldStorageHandler as jest.Mock },
  { method: 'GET', path: '/players', handler: listPlayersHandler as jest.Mock },
  { method: 'GET', path: '/players/:player_address/values', handler: listPlayerStorageHandler as jest.Mock },
  { method: 'GET', path: '/players/:player_address/values/:key', handler: getPlayerStorageHandler as jest.Mock }
]

const WRITE_AND_ENV_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'PUT', path: '/values/:key' },
  { method: 'DELETE', path: '/values/:key' },
  { method: 'DELETE', path: '/values' },
  { method: 'PUT', path: '/players/:player_address/values/:key' },
  { method: 'DELETE', path: '/players/:player_address/values/:key' },
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
  let getLogsReadableSceneMock: jest.Mock

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
        worldPermission: { hasWorldPermission: hasWorldPermissionMock, getLogsReadableScene: getLogsReadableSceneMock },
        sceneLogsAccess: { touch: jest.fn().mockResolvedValue(undefined) }
      } as unknown as BaseComponents
    })
  }

  beforeEach(async () => {
    hasWorldPermissionMock = jest.fn().mockResolvedValue(false)
    getLogsReadableSceneMock = jest.fn().mockResolvedValue(LOGS_READABLE_SCENE)

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

    for (const route of READ_ROUTES) {
      route.handler.mockReset().mockResolvedValue(HANDLER_RESPONSE)
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when a logs-read wallet requests a GET Scene/Player storage route', () => {
    it.each(READ_ROUTES)(
      'should grant access on $method $path via getLogsReadableScene',
      async ({ method, path, handler }) => {
        const handlerFn = getRouteHandler(router, method, path)
        const result = await handlerFn(buildRouteCtx(method), terminalNext)

        expect(getLogsReadableSceneMock).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          ADDRESSES.UNAUTHORIZED.toLowerCase(),
          PARCELS.DEFAULT
        )
        expect(handler).toHaveBeenCalled()
        expect(result).toEqual(HANDLER_RESPONSE)
      }
    )
  })

  describe('when a logs-read wallet requests a write or /env route', () => {
    it.each(WRITE_AND_ENV_ROUTES)(
      'should deny access on $method $path without consulting getLogsReadableScene',
      async ({ method, path }) => {
        const handlerFn = getRouteHandler(router, method, path)

        await expect(handlerFn(buildRouteCtx(method), terminalNext)).rejects.toThrow(NotAuthorizedError)
        expect(getLogsReadableSceneMock).not.toHaveBeenCalled()
      }
    )
  })
})
