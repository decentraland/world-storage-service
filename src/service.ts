import type { Lifecycle } from '@well-known-components/interfaces'
import { setupRouter } from './controllers/routes'
import type { AppComponents, GlobalContext, TestComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>): Promise<void> {
  const { components, startComponents } = program
  const logger = components.logs.getLogger('service')

  logger.info('Starting world storage service')

  const globalContext: GlobalContext = {
    components
  }

  // wire the HTTP router (make it automatic? TBD)
  logger.debug('Setting up HTTP router')
  const router = await setupRouter(globalContext)

  // register routes middleware
  logger.debug('Registering router middleware')
  components.server.use(router.middleware())

  // register not implemented/method not allowed/cors responses middleware
  components.server.use(router.allowedMethods())

  // set the context to be passed to the handlers
  components.server.setContext(globalContext)

  // start ports: db, listeners, synchronizations, etc
  logger.debug('Starting components')
  await startComponents()

  logger.info('World storage service started successfully')
}
