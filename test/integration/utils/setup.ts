import type { AuthIdentity } from '@dcl/crypto'
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestIdentity } from './auth'
import { createLocalFetchWrapper } from './fetch'
import type { TestComponents } from '../../../src/types'

export interface TestSetup {
  signedFetch: ReturnType<typeof signedFetchFactory>
  baseUrl: string
  identity: AuthIdentity
}

export async function createTestSetup(components: TestComponents): Promise<TestSetup> {
  const identity = await createTestIdentity()
  const host = await components.config.requireString('HTTP_SERVER_HOST')
  const port = await components.config.requireNumber('HTTP_SERVER_PORT')
  const baseUrl = `http://${host}:${port}`
  const signedFetch = signedFetchFactory({ fetch: createLocalFetchWrapper(components.localFetch) })

  return { signedFetch, baseUrl, identity }
}
