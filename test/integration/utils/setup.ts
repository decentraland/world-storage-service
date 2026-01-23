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
  worldsContentServer: {
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

  stubComponents.worldsContentServer.getPermissions.resolves({
    owner: address,
    permissions: {
      deployment: { type: 'allow-list', wallets: [] }
    }
  })

  // Mock config.getString to return the test identity's address as AUTHORITATIVE_SERVER_ADDRESS
  // This is required for endpoints that use authorizedAddressesOnlyAuthorizationMiddleware
  const originalGetString = components.config.getString.bind(components.config)
  const mockedGetString = async (key: string): Promise<string | undefined> => {
    if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
      return address
    }
    return originalGetString(key)
  }
  components.config.getString = mockedGetString

  const resetStubs = () => {
    stubComponents.worldsContentServer.getPermissions.reset()
    // Restore original getString method
    components.config.getString = originalGetString
  }

  return { signedFetch, baseUrl, identity, address, resetStubs }
}
