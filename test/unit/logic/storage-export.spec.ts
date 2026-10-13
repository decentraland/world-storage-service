import { randomBytes } from 'crypto'
import { gunzipSync } from 'zlib'
import type { IConfigComponent } from '@well-known-components/interfaces'
import { createConfigMockedComponent } from '@dcl/core-commons'
import { createStorageExportComponent } from '../../../src/logic/storage-export'
import { serializeCsvExport, serializeJsonExport } from '../../../src/utils/exportSerializers'
import { PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import {
  createLogsMockedComponent,
  createPlayerStorageMockedComponent,
  createWorldStorageMockedComponent
} from '../../mocks/components'
import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'
import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'
import type {
  ExportScene,
  ExportSelection,
  IStorageExportComponent,
  OpenExportResult
} from '../../../src/logic/storage-export'
import type { PlayerExportRow, WorldExportRow } from '../../../src/utils/exportSerializers'
import type { Readable } from 'stream'

const ALL: ExportSelection = { worldKeys: null, playerAddresses: null, playerKeys: null }
const TIMEOUT_SECONDS = 120
const SCENE: ExportScene = { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.DEFAULT }
const OTHER_SCENE: ExportScene = { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.SCENE_A }

async function* fromRows<T>(rows: T[]): AsyncGenerator<T> {
  for (const row of rows) {
    yield await Promise.resolve(row)
  }
}

async function join(chunks: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of chunks) {
    text += chunk
  }
  return text
}

async function gunzipStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return gunzipSync(Buffer.concat(chunks)).toString('utf8')
}

function streamOf(result: OpenExportResult): Readable {
  if (result.kind !== 'stream') {
    throw new Error('Expected a stream, got limit-reached')
  }
  return result.stream
}

function waitForClose(stream: Readable): Promise<void> {
  return new Promise(resolve => {
    if (stream.closed) {
      resolve()
      return
    }
    stream.once('close', () => resolve())
  })
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) {
    await new Promise(resolve => setImmediate(resolve))
  }
}

async function probeSlots(component: IStorageExportComponent, scene: ExportScene): Promise<string[]> {
  const results = [component.openExport(scene, ALL, 'json'), component.openExport(scene, ALL, 'json')]
  for (const result of results) {
    if (result.kind === 'stream') {
      result.stream.on('error', () => undefined)
      result.stream.destroy()
      await waitForClose(result.stream)
    }
  }
  return results.map(result => result.kind)
}

function buildConfig(values: Record<string, number>): jest.Mocked<IConfigComponent> {
  const config = createConfigMockedComponent() as jest.Mocked<IConfigComponent>
  config.requireNumber.mockImplementation(async (key: string) => values[key])
  return config
}

describe('Storage Export Component', () => {
  let worldStorage: jest.Mocked<IWorldStorageComponent>
  let playerStorage: jest.Mocked<IPlayerStorageComponent>
  let config: jest.Mocked<IConfigComponent>
  let logError: jest.Mock
  let logInfo: jest.Mock
  let logs: ReturnType<typeof createLogsMockedComponent>
  let storageExport: IStorageExportComponent
  let worldRows: WorldExportRow[]
  let playerRows: PlayerExportRow[]
  let worldClosed: boolean
  let openStreams: Readable[]

  beforeEach(async () => {
    worldStorage = createWorldStorageMockedComponent()
    playerStorage = createPlayerStorageMockedComponent()
    config = buildConfig({
      EXPORT_MAX_CONCURRENT_PER_SCENE: 1,
      EXPORT_TIMEOUT_SECONDS: TIMEOUT_SECONDS,
      EXPORT_MAX_SIZE_BYTES: 104857600
    })
    logError = jest.fn()
    logInfo = jest.fn()
    logs = createLogsMockedComponent({ error: logError, info: logInfo })
    worldRows = []
    playerRows = []
    worldClosed = false
    openStreams = []
    worldStorage.streamSceneValues.mockImplementation(async function* () {
      try {
        yield* fromRows(worldRows)
      } finally {
        worldClosed = true
      }
    })
    playerStorage.streamScenePlayerValues.mockImplementation(() => fromRows(playerRows))
    storageExport = await createStorageExportComponent({ worldStorage, playerStorage, config, logs })
  })

  afterEach(async () => {
    for (const stream of openStreams) {
      stream.on('error', () => undefined)
      stream.destroy()
      await waitForClose(stream)
    }
    jest.useRealTimers()
    jest.resetAllMocks()
  })

  describe('when opening a json export of everything', () => {
    let body: string
    let expected: string

    beforeEach(async () => {
      worldRows = [
        { key: 'a', value: '1' },
        { key: 'b', value: '{"x":"y"}' }
      ]
      playerRows = [{ player_address: '0xa', key: 'k', value: '"s"' }]
      expected = await join(serializeJsonExport(fromRows(worldRows), fromRows(playerRows)))
      body = await gunzipStream(streamOf(storageExport.openExport(SCENE, ALL, 'json')))
    })

    it('should stream the gzipped json serialization of the scene rows', () => {
      expect(body).toBe(expected)
    })

    it('should read every world value of the scene', () => {
      expect(worldStorage.streamSceneValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, null)
    })

    it('should read every player value of the scene', () => {
      expect(playerStorage.streamScenePlayerValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, {
        addresses: null,
        keys: null
      })
    })
  })

  describe('when opening a csv export', () => {
    let body: string
    let expected: string

    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '1' }]
      playerRows = [{ player_address: '0xa', key: 'k', value: '"s"' }]
      expected = await join(serializeCsvExport(fromRows(worldRows), fromRows(playerRows)))
      body = await gunzipStream(streamOf(storageExport.openExport(SCENE, ALL, 'csv')))
    })

    it('should stream the gzipped csv serialization of the scene rows', () => {
      expect(body).toBe(expected)
    })
  })

  describe('when the selection names specific keys and addresses', () => {
    beforeEach(async () => {
      await gunzipStream(
        streamOf(
          storageExport.openExport(SCENE, { worldKeys: ['a'], playerAddresses: ['0xa'], playerKeys: ['k'] }, 'json')
        )
      )
    })

    it('should pass the world keys through unchanged', () => {
      expect(worldStorage.streamSceneValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, ['a'])
    })

    it('should pass the player addresses and keys through unchanged', () => {
      expect(playerStorage.streamScenePlayerValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, {
        addresses: ['0xa'],
        keys: ['k']
      })
    })
  })

  describe('when the selection has no world keys', () => {
    let body: string

    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '1' }]
      body = await gunzipStream(
        streamOf(storageExport.openExport(SCENE, { worldKeys: [], playerAddresses: null, playerKeys: null }, 'json'))
      )
    })

    it('should not open a world stream', () => {
      expect(worldStorage.streamSceneValues).not.toHaveBeenCalled()
    })

    it('should export an empty world list', () => {
      expect(JSON.parse(body).world).toEqual([])
    })
  })

  describe.each([
    ['addresses', { worldKeys: null, playerAddresses: [], playerKeys: null }],
    ['keys', { worldKeys: null, playerAddresses: null, playerKeys: [] }]
  ])('when the selection has no player %s', (_description, selection) => {
    let body: string

    beforeEach(async () => {
      playerRows = [{ player_address: '0xa', key: 'k', value: '1' }]
      body = await gunzipStream(streamOf(storageExport.openExport(SCENE, selection, 'json')))
    })

    it('should not open a player stream', () => {
      expect(playerStorage.streamScenePlayerValues).not.toHaveBeenCalled()
    })

    it('should export an empty players list', () => {
      expect(JSON.parse(body).players).toEqual([])
    })
  })

  describe('when an export of the scene is already open', () => {
    let second: OpenExportResult

    beforeEach(() => {
      openStreams.push(streamOf(storageExport.openExport(SCENE, ALL, 'json')))
      second = storageExport.openExport(SCENE, ALL, 'json')
    })

    it('should report the limit as reached for a second export of the same scene', () => {
      expect(second).toEqual({ kind: 'limit-reached' })
    })

    describe('and an export of another scene is requested', () => {
      let other: OpenExportResult

      beforeEach(() => {
        other = storageExport.openExport(OTHER_SCENE, ALL, 'json')
        if (other.kind === 'stream') {
          openStreams.push(other.stream)
        }
      })

      it('should open a stream for the other scene', () => {
        expect(other.kind).toBe('stream')
      })
    })
  })

  describe('when an open export is fully read', () => {
    let slots: string[]

    beforeEach(async () => {
      worldRows = [{ key: 'a', value: '1' }]
      const stream = streamOf(storageExport.openExport(SCENE, ALL, 'json'))
      await gunzipStream(stream)
      await waitForClose(stream)
      await settle()
      slots = await probeSlots(storageExport, SCENE)
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })

    it('should close the world source', () => {
      expect(worldClosed).toBe(true)
    })
  })

  describe('when reading the storage fails mid-export', () => {
    let streamError: Error | undefined
    let slots: string[]

    beforeEach(async () => {
      streamError = undefined
      worldStorage.streamSceneValues.mockImplementation(async function* () {
        try {
          yield await Promise.resolve({ key: 'a', value: '1' })
          throw new Error('connection lost')
        } finally {
          worldClosed = true
        }
      })
      const stream = streamOf(storageExport.openExport(SCENE, ALL, 'json'))
      stream.on('error', error => {
        streamError = error
      })
      stream.resume()
      await waitForClose(stream)
      await settle()
      slots = await probeSlots(storageExport, SCENE)
    })

    it('should destroy the stream with the error', () => {
      expect(streamError?.message).toBe('connection lost')
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })

    it('should close the world source', () => {
      expect(worldClosed).toBe(true)
    })

    it('should log the failure at error with only the scene', () => {
      expect(logError).toHaveBeenCalledWith(expect.any(String), {
        worldName: WORLD_NAMES.DEFAULT,
        placeId: PLACE_IDS.DEFAULT
      })
    })
  })

  describe('when the consumer destroys the stream mid-export', () => {
    let slots: string[]
    let logInfoCalls: unknown[][]
    let logErrorCalls: unknown[][]

    beforeEach(async () => {
      worldStorage.streamSceneValues.mockImplementation(async function* () {
        try {
          for (let index = 0; ; index++) {
            yield await Promise.resolve({ key: `k${index}`, value: JSON.stringify(randomBytes(2048).toString('hex')) })
          }
        } finally {
          worldClosed = true
        }
      })
      const stream = streamOf(storageExport.openExport(SCENE, ALL, 'json'))
      await new Promise(resolve => stream.once('readable', resolve))
      stream.destroy()
      await waitForClose(stream)
      await settle()
      logInfoCalls = [...logInfo.mock.calls]
      logErrorCalls = [...logError.mock.calls]
      slots = await probeSlots(storageExport, SCENE)
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })

    it('should close the world source before it is exhausted', () => {
      expect(worldClosed).toBe(true)
    })

    it('should log the cancellation at info with only the scene', () => {
      expect(logInfoCalls).toContainEqual([
        'Export cancelled by client',
        { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.DEFAULT }
      ])
    })

    it('should not log an error', () => {
      expect(logErrorCalls).toEqual([])
    })
  })

  describe('when the export is still streaming after the time limit', () => {
    let streamError: Error | undefined
    let slots: string[]

    beforeEach(async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
      streamError = undefined
      worldStorage.streamSceneValues.mockImplementation(async function* () {
        try {
          for (let index = 0; ; index++) {
            yield await Promise.resolve({ key: `k${index}`, value: JSON.stringify(randomBytes(2048).toString('hex')) })
          }
        } finally {
          worldClosed = true
        }
      })
      const stream = streamOf(storageExport.openExport(SCENE, ALL, 'json'))
      stream.on('error', error => {
        streamError = error
      })
      await settle()
      jest.advanceTimersByTime(TIMEOUT_SECONDS * 1000)
      await waitForClose(stream)
      await settle()
      slots = await probeSlots(storageExport, SCENE)
    })

    it('should destroy the stream with an error', () => {
      expect(streamError).toBeInstanceOf(Error)
    })

    it('should close the world source before it is exhausted', () => {
      expect(worldClosed).toBe(true)
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })

    it('should log the timeout at error with only the scene', () => {
      expect(logError).toHaveBeenCalledWith(expect.any(String), {
        worldName: WORLD_NAMES.DEFAULT,
        placeId: PLACE_IDS.DEFAULT
      })
    })
  })

  describe('when the time limit passes after the export was produced but before the client read it', () => {
    let stream: Readable
    let slots: string[]

    beforeEach(async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
      worldRows = [{ key: 'a', value: '1' }]
      stream = streamOf(storageExport.openExport(SCENE, ALL, 'json'))
      await settle()
      jest.advanceTimersByTime(TIMEOUT_SECONDS * 1000)
      await waitForClose(stream)
      await settle()
      slots = await probeSlots(storageExport, SCENE)
    })

    it('should log the timeout at error with only the scene', () => {
      expect(logError).toHaveBeenCalledWith('Export timed out', {
        worldName: WORLD_NAMES.DEFAULT,
        placeId: PLACE_IDS.DEFAULT
      })
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })
  })

  describe('when the raw output exceeds the maximum size', () => {
    let cappedExport: IStorageExportComponent
    let streamError: Error | undefined
    let slots: string[]

    beforeEach(async () => {
      streamError = undefined
      worldStorage.streamSceneValues.mockImplementation(async function* () {
        try {
          for (let index = 0; ; index++) {
            yield await Promise.resolve({ key: `k${index}`, value: '"€€€€€€€€€€"' })
          }
        } finally {
          worldClosed = true
        }
      })
      cappedExport = await createStorageExportComponent({
        worldStorage,
        playerStorage,
        config: buildConfig({
          EXPORT_MAX_CONCURRENT_PER_SCENE: 1,
          EXPORT_TIMEOUT_SECONDS: TIMEOUT_SECONDS,
          EXPORT_MAX_SIZE_BYTES: 20
        }),
        logs
      })
      const stream = streamOf(cappedExport.openExport(SCENE, ALL, 'json'))
      stream.on('error', error => {
        streamError = error
      })
      stream.resume()
      await waitForClose(stream)
      await settle()
      slots = await probeSlots(cappedExport, SCENE)
    })

    it('should destroy the stream with the size error', () => {
      expect(streamError?.message).toBe('Export exceeds maximum size')
    })

    it('should close the world source before it is exhausted', () => {
      expect(worldClosed).toBe(true)
    })

    it('should release the scene slot exactly once', () => {
      expect(slots).toEqual(['stream', 'limit-reached'])
    })

    it('should log the size cap at error with only the scene', () => {
      expect(logError).toHaveBeenCalledWith(expect.any(String), {
        worldName: WORLD_NAMES.DEFAULT,
        placeId: PLACE_IDS.DEFAULT
      })
    })
  })
})
