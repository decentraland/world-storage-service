import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { calculateValueSizeInBytes } from '../../../src/utils/calculateValueSizeInBytes'
import { test } from '../../components'
import { ADDRESSES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when getting player storage usage', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let playerAddress: string
  let maxTotalSizeBytes: number

  beforeEach(async () => {
    playerAddress = ADDRESSES.PLAYER
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
    maxTotalSizeBytes = await components.config.requireNumber('PLAYER_STORAGE_MAX_TOTAL_SIZE_BYTES')
  })

  afterEach(() => {
    resetStubs()
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/players/${playerAddress}/usage`, { method: 'GET' })
    })

    it('should respond with a 400 and a signed fetch required message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Invalid Auth Chain',
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      })
    })
  })

  describe('and the player address is invalid', () => {
    it('should respond with a 400 and an invalid player address message', async () => {
      const response = await signedFetch(`${baseUrl}/players/${ADDRESSES.INVALID}/usage`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Bad request',
        message: 'Invalid player address'
      })
    })
  })

  describe('and no values exist for the player', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })

      response = await signedFetch(`${baseUrl}/players/${playerAddress}/usage`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and zero used bytes', async () => {
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        usedBytes: 0,
        maxTotalSizeBytes
      })
    })
  })

  describe('and values exist for multiple players', () => {
    let expectedUsedBytes: number
    let anotherPlayerAddress: string

    beforeEach(async () => {
      anotherPlayerAddress = ADDRESSES.OWNER

      const targetPlayerItems = [
        { key: 'inventory', value: { items: ['sword', 'shield'] } },
        { key: 'level', value: 5 }
      ]
      expectedUsedBytes = targetPlayerItems.reduce(
        (total, item) => total + calculateValueSizeInBytes(JSON.stringify(item.value)),
        0
      )

      await Promise.all([
        ...targetPlayerItems.map(item =>
          signedFetch(`${baseUrl}/players/${playerAddress}/values/${item.key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: item.value }),
            identity,
            metadata: TEST_REALM_METADATA
          })
        ),
        signedFetch(`${baseUrl}/players/${anotherPlayerAddress}/values/score`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 1000 }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      ])
    })

    afterEach(async () => {
      await Promise.all([
        signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
          method: 'DELETE',
          headers: { 'X-Confirm-Delete-All': 'true' },
          identity,
          metadata: TEST_REALM_METADATA
        }),
        signedFetch(`${baseUrl}/players/${anotherPlayerAddress}/values`, {
          method: 'DELETE',
          headers: { 'X-Confirm-Delete-All': 'true' },
          identity,
          metadata: TEST_REALM_METADATA
        })
      ])
    })

    it('should respond with a 200 and usage for the requested player only', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/usage`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        usedBytes: expectedUsedBytes,
        maxTotalSizeBytes
      })
    })
  })

  describe('and the storage throws an error', () => {
    beforeEach(() => {
      stubComponents.playerStorage.getSizeInfo.rejects(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.playerStorage.getSizeInfo.reset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/usage`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body).toEqual({
        error: 'Internal Server Error'
      })
    })
  })
})
