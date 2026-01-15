import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('Delete Env Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void

  describe('when deleting an env storage value', () => {
    let key: string
    let identity: AuthIdentity
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      key = 'MY_ENV_VAR'
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
        response = await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE' })
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

    describe('and the delete succeeds', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'to-delete-secret'
        await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity,
          metadata: TEST_REALM_METADATA
        })
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'DELETE',
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should delete the value and respond with a 204', async () => {
        const getResponse = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await getResponse.json()
        expect(response.status).toBe(204)
        expect(getResponse.status).toBe(404)
        expect(body).toEqual({
          error: 'Not Found',
          message: 'Value not found'
        })
      })
    })

    describe('and the storage delete throws an error', () => {
      beforeEach(async () => {
        stubComponents.envStorage.deleteValue.rejects(new Error('boom'))
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'DELETE',
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      afterEach(() => {
        stubComponents.envStorage.deleteValue.reset()
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
})
