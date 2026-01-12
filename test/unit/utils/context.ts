import type { IHttpServerComponent } from '@well-known-components/interfaces'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { WorldAuthMetadata } from '../../../src/controllers/middlewares/world-name-middleware'
import type { WorldStorageContext } from '../../../src/types'

export type TestContext = IHttpServerComponent.DefaultContext<
  WorldStorageContext & DecentralandSignatureContext<WorldAuthMetadata>
> & {
  params: Record<string, string>
}

export function buildTestContext(overrides: Partial<TestContext>): TestContext {
  return {
    request: new Request('http://localhost/values/key'),
    url: new URL('http://localhost/values/key'),
    params: {},
    components: {},
    ...overrides
  } as unknown as TestContext
}
