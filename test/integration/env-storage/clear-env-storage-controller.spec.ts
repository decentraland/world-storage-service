import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when clearing all env storage values', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let response: Awaited<ReturnType<typeof signedFetch>>

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
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' }
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

  describe('and the X-Confirm-Delete-All header is missing', () => {
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 400 and a missing header message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Bad request',
        message: 'Missing required header: X-Confirm-Delete-All'
      })
    })
  })

  describe('and the clear succeeds', () => {
    beforeEach(async () => {
      await Promise.all([
        signedFetch(`${baseUrl}/env/API_KEY`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'secret1' }),
          identity,
          metadata: TEST_REALM_METADATA
        }),
        signedFetch(`${baseUrl}/env/API_SECRET`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'secret2' }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      ])
      response = await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should delete all env values and respond with a 204', async () => {
      expect(response.status).toBe(204)

      const [getResponse1, getResponse2] = await Promise.all([
        signedFetch(`${baseUrl}/env/API_KEY`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        }),
        signedFetch(`${baseUrl}/env/API_SECRET`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
      ])

      expect(getResponse1.status).toBe(404)
      expect(getResponse2.status).toBe(404)
    })
  })

  describe('and the storage clear throws an error', () => {
    beforeEach(async () => {
      stubComponents.envStorage.deleteAll.rejects(new Error('boom'))
      response = await signedFetch(`${baseUrl}/env`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(() => {
      stubComponents.envStorage.deleteAll.reset()
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
