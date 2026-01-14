import type { AuthIdentity } from '@dcl/crypto'
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestIdentityWithAddress } from './auth'
import { createLocalFetchWrapper } from './fetch'
import type { TestComponents } from '../../../src/types'

export interface TestSetup {
  signedFetch: ReturnType<typeof signedFetchFactory>
  baseUrl: string
  identity: AuthIdentity
  address: string
  resetStubs: () => void
}

interface StubComponents {
  worldContentServer: {
    getPermissions: {
      resolves: (value: unknown) => void
      reset: () => void
    }
  }
}

export async function createTestSetup(components: TestComponents, stubComponents: StubComponents): Promise<TestSetup> {
  const { identity, address } = await createTestIdentityWithAddress()
  const host = await components.config.requireString('HTTP_SERVER_HOST')
  const port = await components.config.requireNumber('HTTP_SERVER_PORT')
  const baseUrl = `http://${host}:${port}`
  const signedFetch = signedFetchFactory({ fetch: createLocalFetchWrapper(components.localFetch) })

  stubComponents.worldContentServer.getPermissions.resolves({
    owner: address,
    permissions: {
      deployment: { type: 'allow-list', wallets: [] },
      access: { type: 'allow-list', wallets: [] },
      streaming: { type: 'allow-list', wallets: [] }
    }
  })

  const resetStubs = () => {
    stubComponents.worldContentServer.getPermissions.reset()
  }

  return { signedFetch, baseUrl, identity, address, resetStubs }
}
