import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import type { AuthIdentity } from '@dcl/crypto'
import { Authenticator } from '@dcl/crypto'

export async function createTestIdentity(): Promise<AuthIdentity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => Authenticator.createSignature(realAccount, message)
  )

  return authChain
}
