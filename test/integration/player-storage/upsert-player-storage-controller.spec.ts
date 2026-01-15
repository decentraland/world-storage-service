import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('Upsert Player Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void

  describe('when upserting a player storage value', () => {
    let key: string
    let playerAddress: string
    let identity: AuthIdentity
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      key = 'my-key'
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
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
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

    describe('and the player address is invalid', () => {
      let invalidPlayerAddress: string

      beforeEach(async () => {
        invalidPlayerAddress = ADDRESSES.INVALID
        response = await signedFetch(`${baseUrl}/players/${invalidPlayerAddress}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'payload' }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should respond with a 400 and an invalid player address message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body).toEqual({
          error: 'Bad request',
          message: 'Invalid player address'
        })
      })
    })

    describe('and the request body is not valid JSON', () => {
      let invalidBody: string

      beforeEach(async () => {
        invalidBody = '{ "value": '
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
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
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
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
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      afterEach(async () => {
        await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'DELETE',
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should store the value and respond with a 200', async () => {
        const body = await response.json()
        const getResponse = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
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

    describe('and the database throws an error', () => {
      beforeEach(async () => {
        stubComponents.playerStorage.setValue.rejects(new Error('boom'))
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'payload' }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      afterEach(() => {
        stubComponents.playerStorage.setValue.reset()
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
