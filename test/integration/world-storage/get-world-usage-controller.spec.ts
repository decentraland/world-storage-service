import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { calculateValueSizeInBytes } from '../../../src/utils/calculateValueSizeInBytes'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when getting world storage usage', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let maxTotalSizeBytes: number

  beforeEach(async () => {
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
    maxTotalSizeBytes = await components.config.requireNumber('WORLD_STORAGE_MAX_TOTAL_SIZE_BYTES')
  })

  afterEach(() => {
    resetStubs()
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/usage`, { method: 'GET' })
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

  describe('and no values exist', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      await signedFetch(`${baseUrl}/values`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })

      response = await signedFetch(`${baseUrl}/usage`, {
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

  describe('and values exist', () => {
    let expectedUsedBytes: number

    beforeEach(async () => {
      const storedItems = [
        { key: 'alpha-key', value: { foo: 'bar' } },
        { key: 'beta-key', value: 123 },
        { key: 'gamma-key', value: 'string-value' }
      ]
      expectedUsedBytes = storedItems.reduce(
        (total, item) => total + calculateValueSizeInBytes(JSON.stringify(item.value)),
        0
      )

      await Promise.all(
        storedItems.map(item =>
          signedFetch(`${baseUrl}/values/${item.key}`, {
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
      await signedFetch(`${baseUrl}/values`, {
        method: 'DELETE',
        headers: { 'X-Confirm-Delete-All': 'true' },
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and the current usage and max limit', async () => {
      const response = await signedFetch(`${baseUrl}/usage`, {
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
      stubComponents.worldStorage.getSizeInfo.rejects(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.worldStorage.getSizeInfo.reset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/usage`, {
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
