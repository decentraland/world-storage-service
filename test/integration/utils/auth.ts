import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import type { AuthIdentity, IdentityType } from '@dcl/crypto'
import { Authenticator } from '@dcl/crypto'
import { signedHeaderFactory } from 'decentraland-crypto-fetch'
import type { TestComponents } from '../../../src/types'

export interface Identity {
  authChain: AuthIdentity
  realAccount: IdentityType
  ephemeralIdentity: IdentityType
}

export async function createTestIdentity(): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => Authenticator.createSignature(realAccount, message)
  )

  return { authChain, realAccount, ephemeralIdentity }
}

export function createAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, unknown>,
  identity: Identity
): Record<string, string> {
  const signer = signedHeaderFactory()
  const basePath = path.split('?')[0]
  const signedHeaders = signer(identity.authChain, method, basePath, metadata)

  return Object.fromEntries(signedHeaders.entries())
}

export function makeAuthenticatedRequest(
  components: Pick<TestComponents, 'localFetch'>
): (
  identity: Identity | undefined,
  path: string,
  method?: string,
  body?: unknown,
  headers?: Record<string, string>
) => ReturnType<TestComponents['localFetch']['fetch']> {
  return (
    identity: Identity | undefined,
    path: string,
    method = 'GET',
    body?: unknown,
    headers?: Record<string, string>
  ) => {
    const { localFetch } = components
    const requestBody = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body)

    return localFetch.fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '192.168.1.100',
        'x-forwarded-for': '192.168.1.100',
        'x-real-ip': '192.168.1.100',
        ...(identity ? createAuthHeaders(method, path, {}, identity) : {}),
        ...headers
      },
      body: requestBody
    })
  }
}
