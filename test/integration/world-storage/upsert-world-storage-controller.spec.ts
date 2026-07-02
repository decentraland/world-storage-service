import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { StorageLimitExceededError } from '../../../src/logic/storage-limits'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when upserting a world storage value', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let key: string
  let identity: AuthIdentity
  let response: Awaited<ReturnType<typeof signedFetch>>

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
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'payload' })
      })
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

  describe('and the request body is not valid JSON', () => {
    let invalidBody: string

    beforeEach(async () => {
      invalidBody = '{ "value": '
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: invalidBody,
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 400 and an invalid json message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toContain('Unexpected end of JSON input')
    })
  })

  describe('and the request body does not include a value', () => {
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 400 and a missing value message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body.message).toEqual('Invalid JSON body')
    })
  })

  describe('and the value is provided', () => {
    let storedValue: unknown

    beforeEach(async () => {
      storedValue = { foo: 'bar' }
      response = await signedFetch(`${baseUrl}/values/${key}`, {
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

    it('should store the value and respond with a 200', async () => {
      const body = await response.json()
      const getResponse = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const getBody = await getResponse.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        value: storedValue
      })
      expect(getResponse.status).toBe(200)
      expect(getBody).toEqual({
        value: storedValue
      })
    })
  })

  describe('and the storage limits validation fails', () => {
    let errorMessage: string

    beforeEach(async () => {
      errorMessage = 'Value size (600000 bytes) exceeds the maximum allowed size (524288 bytes)'
      stubComponents.storageLimits.validateWorldStorageUpsert.mockRejectedValue(
        new StorageLimitExceededError(errorMessage)
      )
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'payload' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(() => {
      stubComponents.storageLimits.validateWorldStorageUpsert.mockReset()
    })

    it('should respond with a 400 and the storage limit error message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Bad request',
        message: errorMessage
      })
    })
  })

  describe('and the key is longer than 255 characters', () => {
    let longKey: string

    beforeEach(async () => {
      longKey = 'a'.repeat(256)
      response = await signedFetch(`${baseUrl}/values/${longKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'payload' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 400 and the key length constraint', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Bad request',
        message: 'Key must be between 1 and 255 characters'
      })
    })
  })

  describe('and the request body exceeds the size cap', () => {
    beforeEach(async () => {
      // World per-value limit (524288) + envelope slack (1024), exceeded by the JSON wrapper.
      const oversizedValue = 'x'.repeat(524288 + 1024)
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: oversizedValue }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 413 and a payload too large message', async () => {
      const body = await response.json()
      expect(response.status).toBe(413)
      expect(body).toEqual({
        error: 'Payload Too Large',
        message: 'Request body exceeds the maximum allowed size (525312 bytes)'
      })
    })
  })

  describe('and the value contains a NUL character', () => {
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: `a${String.fromCharCode(0)}b` }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 400 and a NUL character message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Bad request',
        message: 'Values must not contain the \\u0000 (NUL) character'
      })
    })
  })

  describe('and the database throws an error', () => {
    beforeEach(async () => {
      stubComponents.worldStorage.setValue.mockRejectedValue(new Error('boom'))
      response = await signedFetch(`${baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'payload' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(() => {
      stubComponents.worldStorage.setValue.mockReset()
    })

    it('should respond with a 500 and the error message', async () => {
      const body = await response.json()
      expect(response.status).toBe(500)
      expect(body).toEqual({
        error: 'Internal Server Error'
      })
    })
  })
})
