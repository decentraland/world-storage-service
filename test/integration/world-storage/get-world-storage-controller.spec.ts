import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when getting a world storage value', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let key: string
  let identity: AuthIdentity

  beforeEach(async () => {
    key = 'my-key'
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
      response = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET' })
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

  describe('and the value does not exist', () => {
    beforeEach(async () => {
      await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 404 and a not found message', async () => {
      const response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(404)
      expect(body).toEqual({
        error: 'Not Found',
        message: 'Value not found'
      })
    })
  })

  describe('and the value exists', () => {
    let storedValue: string

    beforeEach(async () => {
      storedValue = 'stored-value'
      await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: storedValue }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(async () => {
      await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 200 and the stored value', async () => {
      const response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        value: storedValue
      })
    })
  })

  describe('and the value exists but is falsy', () => {
    // Regression for the not-found semantics fix: a stored falsy value must be returned with a 200,
    // not mistaken for an absent key (which previously produced a 404).
    const falsyValues: Array<{ description: string; value: unknown }> = [
      { description: 'the number zero', value: 0 },
      { description: 'the boolean false', value: false },
      { description: 'an empty string', value: '' },
      { description: 'null', value: null }
    ]

    afterEach(async () => {
      await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it.each(falsyValues)('should respond with a 200 and the value when it is $description', async ({ value }) => {
      await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
        identity,
        metadata: TEST_REALM_METADATA
      })

      const response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({ value })
    })
  })

  describe('and the value contains special characters', () => {
    let storedValue: { text: string; nested: number[] }

    beforeEach(async () => {
      // Exercises the value::text passthrough: quotes, backslashes, newlines and unicode must
      // survive being spliced into the response body verbatim.
      storedValue = { text: 'quote " backslash \\ newline \n unicode 😀 ✅', nested: [1, 2, 3] }
      await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: storedValue }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(async () => {
      await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 200 and the value round-tripped intact', async () => {
      const response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({ value: storedValue })
    })
  })

  describe('and the value is updated after having been read', () => {
    afterEach(async () => {
      await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with the updated value, not the previously cached one', async () => {
      // First write + read populates the read-through cache for this key.
      await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'first' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
      const firstResponse = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      expect(await firstResponse.json()).toEqual({ value: 'first' })

      // A subsequent write must invalidate the cached entry so the next read sees the new value.
      await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'second' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
      const secondResponse = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      expect(await secondResponse.json()).toEqual({ value: 'second' })
    })
  })

  describe('and the database throws an error', () => {
    beforeEach(() => {
      stubComponents.worldStorage.getValue.mockRejectedValue(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.worldStorage.getValue.mockReset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/values/${key}`, {
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
