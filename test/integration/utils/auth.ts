import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import type { AuthIdentity } from '@dcl/crypto'
import { Authenticator } from '@dcl/crypto'
import { WORLD_NAMES } from '../../fixtures'

export interface TestIdentityWithAddress {
  identity: AuthIdentity
  address: string
}

/**
 * Default metadata required for signed requests.
 * The sceneContextMiddleware extracts worldName from realm.serverName or realmName,
 * and parcel from metadata.parcel (defaults to '0,0' if absent).
 */
export const TEST_REALM_METADATA = {
  realm: {
    serverName: WORLD_NAMES.DEFAULT
  },
  parcel: '0,0'
}

export async function createTestIdentity(): Promise<AuthIdentity> {
  const { identity } = await createTestIdentityWithAddress()
  return identity
}

export async function createTestIdentityWithAddress(): Promise<TestIdentityWithAddress> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(realAccount.address, ephemeralIdentity, 10, async message =>
    Authenticator.createSignature(realAccount, message)
  )

  return {
    identity: authChain,
    address: realAccount.address
  }
}
