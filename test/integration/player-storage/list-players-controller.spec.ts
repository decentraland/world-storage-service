import type { AuthIdentity } from '@dcl/crypto'
import { InvalidRequestError } from '@dcl/http-commons'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when listing players with stored values', function ({ components, stubComponents }) {
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
      response = await signedFetch(`${baseUrl}/players`, { method: 'GET' })
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

  describe('and no players have stored values', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      // Clear all player storage first
      await signedFetch(`${baseUrl}/players`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
      response = await signedFetch(`${baseUrl}/players`, {
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

  describe('and players have stored values', () => {
    let playerAddressA: string
    let playerAddressB: string
    let playerAddressC: string

    beforeEach(async () => {
      playerAddressA = ADDRESSES.DEPLOYER
      playerAddressB = ADDRESSES.OWNER
      playerAddressC = ADDRESSES.PLAYER

      // Create values for three different players
      await Promise.all([
        signedFetch(`${baseUrl}/players/${playerAddressA}/values/key1`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'value1' }),
          identity,
          metadata: TEST_REALM_METADATA
        }),
        signedFetch(`${baseUrl}/players/${playerAddressB}/values/key2`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'value2' }),
          identity,
          metadata: TEST_REALM_METADATA
        }),
        signedFetch(`${baseUrl}/players/${playerAddressC}/values/key3`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'value3' }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      ])
    })

    afterEach(async () => {
      // Clean up all player storage
      await signedFetch(`${baseUrl}/players`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and the list of player addresses sorted alphabetically', async () => {
      const response = await signedFetch(`${baseUrl}/players`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      const expectedAddresses = [playerAddressA, playerAddressB, playerAddressC].sort()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: expectedAddresses,
        pagination: { limit: 100, offset: 0, total: 3 }
      })
    })

    it('should return distinct addresses even when a player has multiple keys', async () => {
      // Add another key for playerAddressA
      await signedFetch(`${baseUrl}/players/${playerAddressA}/values/extra-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'extra-value' }),
        identity,
        metadata: TEST_REALM_METADATA
      })

      const response = await signedFetch(`${baseUrl}/players`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      const expectedAddresses = [playerAddressA, playerAddressB, playerAddressC].sort()
      expect(response.status).toBe(200)
      expect(body.data).toEqual(expectedAddresses)
      expect(body.pagination.total).toBe(3)
    })

    describe('and a limit is provided', () => {
      it('should respond with only the specified number of players', async () => {
        const response = await signedFetch(`${baseUrl}/players?limit=2`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        const expectedAddresses = [playerAddressA, playerAddressB, playerAddressC].sort()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: expectedAddresses.slice(0, 2),
          pagination: { limit: 2, offset: 0, total: 3 }
        })
      })
    })

    describe('and an offset is provided', () => {
      it('should respond with players starting from the offset', async () => {
        const response = await signedFetch(`${baseUrl}/players?offset=1`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        const expectedAddresses = [playerAddressA, playerAddressB, playerAddressC].sort()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: expectedAddresses.slice(1),
          pagination: { limit: 100, offset: 1, total: 3 }
        })
      })
    })

    describe('and limit and offset are combined', () => {
      it('should respond with the correct page of results', async () => {
        const response = await signedFetch(`${baseUrl}/players?limit=1&offset=1`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        const expectedAddresses = [playerAddressA, playerAddressB, playerAddressC].sort()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: [expectedAddresses[1]],
          pagination: { limit: 1, offset: 1, total: 3 }
        })
      })
    })
  })

  describe('and an invalid limit is provided', () => {
    it('should default to 100 for non-numeric limit', async () => {
      const response = await signedFetch(`${baseUrl}/players?limit=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
    })

    it('should default to 100 for limit exceeding maximum', async () => {
      const response = await signedFetch(`${baseUrl}/players?limit=101`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.limit).toBe(100)
    })

    it('should default to 100 for zero limit', async () => {
      const response = await signedFetch(`${baseUrl}/players?limit=0`, {
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
      const response = await signedFetch(`${baseUrl}/players?offset=invalid`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.offset).toBe(0)
    })

    it('should default to 0 for negative offset', async () => {
      const response = await signedFetch(`${baseUrl}/players?offset=-1`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.pagination.offset).toBe(0)
    })
  })

  describe('and the storage throws an InvalidRequestError', () => {
    beforeEach(() => {
      stubComponents.playerStorage.listPlayers.rejects(new InvalidRequestError('invalid request'))
    })

    afterEach(() => {
      stubComponents.playerStorage.listPlayers.reset()
    })

    it('should respond with a 400 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/players`, {
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
      stubComponents.playerStorage.listPlayers.rejects(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.playerStorage.listPlayers.reset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/players`, {
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
