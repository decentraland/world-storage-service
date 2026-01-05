import type { AppComponents } from '../types'

/**
 * Returns the database connection string
 * @param config - The config
 * @returns The database connection string
 */
export async function getDbConnectionString({
  config,
  prefix = ''
}: Pick<AppComponents, 'config'> & { prefix?: string }): Promise<string> {
  let databaseUrl: string | undefined = await config.getString(`${prefix}PG_COMPONENT_PSQL_CONNECTION_STRING`)
  if (!databaseUrl) {
    const dbUser = await config.requireString(`${prefix}PG_COMPONENT_PSQL_USER`)
    const dbDatabaseName = await config.requireString(`${prefix}PG_COMPONENT_PSQL_DATABASE`)
    const dbPort = await config.requireString(`${prefix}PG_COMPONENT_PSQL_PORT`)
    const dbHost = await config.requireString(`${prefix}PG_COMPONENT_PSQL_HOST`)
    const dbPassword = await config.requireString(`${prefix}PG_COMPONENT_PSQL_PASSWORD`)
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }

  return databaseUrl
}
