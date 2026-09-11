import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createLocalFetchComponent, createRunner } from '@dcl/test-helpers'
import { initComponents as originalInitComponents } from '../src/components'
import { main } from '../src/service'
import type { ICatalystSyncComponent } from '../src/adapters/catalyst-sync/types'
import type { TestComponents } from '../src/types'

export const test = createRunner<TestComponents>({
  main,
  initComponents
})

const inertCatalystSync: ICatalystSyncComponent = {
  [START_COMPONENT]: async () => undefined,
  [STOP_COMPONENT]: async () => undefined
}

async function initComponents(): Promise<TestComponents> {
  const components = await originalInitComponents()

  const { config } = components

  return {
    ...components,
    catalystSync: inertCatalystSync,
    localFetch: await createLocalFetchComponent(config)
  }
}
