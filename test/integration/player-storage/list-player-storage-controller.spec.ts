import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when listing player storage values', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let playerAddress: string

  beforeEach(async () => {
    playerAddress = ADDRESSES.PLAYER
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
  })

  afterEach(() => {
    resetStubs()
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/players/${playerAddress}/values`, { method: 'GET' })
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
      const response = await signedFetch(`${baseUrl}/players/invalid-address/values`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('Invalid player address')
    })
  })

  describe('and no values exist', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      // Clear all values first
      await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
      response = await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and an empty data array', async () => {
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: [],
        pagination: { limit: 100, offset: 0, total: 0 }
      })
    })
  })

  describe('and values exist', () => {
    let storedItems: Array<{ key: string; value: unknown }>

    beforeEach(async () => {
      storedItems = [
        { key: 'inventory', value: { items: ['sword', 'shield'] } },
        { key: 'level', value: 5 },
        { key: 'score', value: 1000 }
      ]
      // Create values
      await Promise.all(
        storedItems.map(item =>
          signedFetch(`${baseUrl}/players/${playerAddress}/values/${item.key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: item.value }),
            identity,
            metadata: TEST_REALM_METADATA
          })
        )
      )
    })

    afterEach(async () => {
      // Clean up
      await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and the list of key-value pairs sorted alphabetically by key', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: [
          { key: 'inventory', value: { items: ['sword', 'shield'] } },
          { key: 'level', value: 5 },
          { key: 'score', value: 1000 }
        ],
        pagination: { limit: 100, offset: 0, total: 3 }
      })
    })

    describe('and a limit is provided', () => {
      it('should respond with only the specified number of items', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?limit=2`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [
            { key: 'inventory', value: { items: ['sword', 'shield'] } },
            { key: 'level', value: 5 }
          ],
          pagination: { limit: 2, offset: 0, total: 3 }
        })
      })
    })

    describe('and an offset is provided', () => {
      it('should respond with items starting from the offset', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?offset=1`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [
            { key: 'level', value: 5 },
            { key: 'score', value: 1000 }
          ],
          pagination: { limit: 100, offset: 1, total: 3 }
        })
      })
    })

    describe('and a prefix is provided', () => {
      it('should respond with items matching the prefix case-insensitively', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?prefix=LEVEL`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [{ key: 'level', value: 5 }],
          pagination: { limit: 100, offset: 0, total: 1 }
        })
      })
    })

    describe('and limit and offset are combined', () => {
      it('should respond with the correct page of results', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?limit=1&offset=1`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [{ key: 'level', value: 5 }],
          pagination: { limit: 1, offset: 1, total: 3 }
        })
      })
    })
  })

  describe('and an invalid limit is provided', () => {
    it('should respond with a 400 for non-numeric limit', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?limit=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('limit must be a positive integer')
    })

    it('should respond with a 400 for limit exceeding maximum', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?limit=1001`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('limit cannot exceed 1000')
    })

    it('should respond with a 400 for zero limit', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?limit=0`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('limit must be a positive integer')
    })
  })

  describe('and an invalid offset is provided', () => {
    it('should respond with a 400 for non-numeric offset', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?offset=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('offset must be a non-negative integer')
    })

    it('should respond with a 400 for negative offset', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values?offset=-1`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('offset must be a non-negative integer')
    })
  })

  describe('and the pagination environment variables are not configured', () => {
    let originalGetNumber: typeof components.config.getNumber

    beforeEach(() => {
      originalGetNumber = components.config.getNumber.bind(components.config)
      components.config.getNumber = async (key: string): Promise<number | undefined> => {
        if (key === 'PAGINATION_DEFAULT_LIMIT' || key === 'PAGINATION_MAX_LIMIT') {
          return undefined
        }
        return originalGetNumber(key)
      }
    })

    afterEach(() => {
      components.config.getNumber = originalGetNumber
    })

    it('should use the fallback defaults and respond with a 200', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
      expect(body.pagination.offset).toBe(0)
    })
  })

  describe('and the database throws an error', () => {
    beforeEach(() => {
      stubComponents.playerStorage.listValues.rejects(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.playerStorage.listValues.reset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values`, {
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
