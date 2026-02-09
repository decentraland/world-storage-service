import type { AuthIdentity } from '@dcl/crypto'
import { InvalidRequestError } from '@dcl/http-commons'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when listing env keys', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity

  beforeEach(async () => {
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
      response = await signedFetch(`${baseUrl}/env`, { method: 'GET' })
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

  describe('and no env variables exist', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      // Clear all env variables first
      await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
      response = await signedFetch(`${baseUrl}/env`, {
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

  describe('and env variables exist', () => {
    let storedKeys: string[]

    beforeEach(async () => {
      storedKeys = ['API_SECRET', 'DATABASE_URL', 'SENTRY_DSN']
      // Create env variables
      await Promise.all(
        storedKeys.map(key =>
          signedFetch(`${baseUrl}/env/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: `value-for-${key}` }),
            identity,
            metadata: TEST_REALM_METADATA
          })
        )
      )
    })

    afterEach(async () => {
      // Clean up
      await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and the list of keys sorted alphabetically', async () => {
      const response = await signedFetch(`${baseUrl}/env`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: ['API_SECRET', 'DATABASE_URL', 'SENTRY_DSN'],
        pagination: { limit: 100, offset: 0, total: 3 }
      })
    })

    describe('and a limit is provided', () => {
      it('should respond with only the specified number of keys', async () => {
        const response = await signedFetch(`${baseUrl}/env?limit=2`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: ['API_SECRET', 'DATABASE_URL'],
          pagination: { limit: 2, offset: 0, total: 3 }
        })
      })
    })

    describe('and an offset is provided', () => {
      it('should respond with keys starting from the offset', async () => {
        const response = await signedFetch(`${baseUrl}/env?offset=1`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: ['DATABASE_URL', 'SENTRY_DSN'],
          pagination: { limit: 100, offset: 1, total: 3 }
        })
      })
    })

    describe('and a prefix is provided', () => {
      it('should respond with keys matching the prefix case-sensitively', async () => {
        const response = await signedFetch(`${baseUrl}/env?prefix=API`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: ['API_SECRET'],
          pagination: { limit: 100, offset: 0, total: 1 }
        })
      })

      it('should not match keys with a different case prefix', async () => {
        const response = await signedFetch(`${baseUrl}/env?prefix=api`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [],
          pagination: { limit: 100, offset: 0, total: 0 }
        })
      })
    })
  })

  describe('and an invalid limit is provided', () => {
    it('should default to 100 for non-numeric limit', async () => {
      const response = await signedFetch(`${baseUrl}/env?limit=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
    })

    it('should default to 100 for limit exceeding maximum', async () => {
      const response = await signedFetch(`${baseUrl}/env?limit=101`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
    })

    it('should default to 100 for zero limit', async () => {
      const response = await signedFetch(`${baseUrl}/env?limit=0`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
    })
  })

  describe('and an invalid offset is provided', () => {
    it('should default to 0 for non-numeric offset', async () => {
      const response = await signedFetch(`${baseUrl}/env?offset=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.offset).toBe(0)
    })

    it('should default to 0 for negative offset', async () => {
      const response = await signedFetch(`${baseUrl}/env?offset=-1`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.offset).toBe(0)
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
      const response = await signedFetch(`${baseUrl}/env`, {
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

  describe('and the storage throws an InvalidRequestError', () => {
    beforeEach(() => {
      stubComponents.envStorage.listKeys.rejects(new InvalidRequestError('invalid request'))
    })

    afterEach(() => {
      stubComponents.envStorage.listKeys.reset()
    })

    it('should respond with a 400 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/env`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toBe('invalid request')
    })
  })

  describe('and the database throws an error', () => {
    beforeEach(() => {
      stubComponents.envStorage.listKeys.rejects(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.envStorage.listKeys.reset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/env`, {
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
