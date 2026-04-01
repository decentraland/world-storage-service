import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

interface PlacesApiResponse {
  data?: Array<{ id?: string }>
}

const TABLES: Array<{ table: string; oldPkColumns: string[]; newPkColumns: string[] }> = [
  {
    table: 'world_storage',
    oldPkColumns: ['world_name', 'key'],
    newPkColumns: ['world_name', 'place_id', 'key']
  },
  {
    table: 'player_storage',
    oldPkColumns: ['world_name', 'player_address', 'key'],
    newPkColumns: ['world_name', 'place_id', 'player_address', 'key']
  },
  {
    table: 'env_variables',
    oldPkColumns: ['world_name', 'key'],
    newPkColumns: ['world_name', 'place_id', 'key']
  }
]

async function getDistinctWorldNames(db: MigrationBuilder['db']): Promise<string[]> {
  const worldNames = new Set<string>()

  for (const { table } of TABLES) {
    const result = (await db.query(`SELECT DISTINCT world_name FROM ${table}`)) as {
      rows: Array<{ world_name: string }>
    }

    for (const row of result.rows) {
      worldNames.add(row.world_name)
    }
  }

  return [...worldNames]
}

async function resolvePlaceId(worldName: string): Promise<string> {
  const placesUrl = (process.env.PLACES_URL ?? 'https://places.decentraland.org').replace(/\/$/, '')
  const response = await fetch(`${placesUrl}/api/places?names=${encodeURIComponent(worldName)}`)

  if (!response.ok) {
    throw new Error(`Places API returned HTTP ${response.status} while resolving place_id for world "${worldName}"`)
  }

  const body = (await response.json()) as PlacesApiResponse
  const placeId = body.data?.[0]?.id

  if (!placeId) {
    throw new Error(`Places API returned no place_id for world "${worldName}"`)
  }

  return placeId
}

async function backfillPlaceIds(db: MigrationBuilder['db']): Promise<void> {
  const worldNames = await getDistinctWorldNames(db)

  for (const worldName of worldNames) {
    const placeId = await resolvePlaceId(worldName)

    for (const { table } of TABLES) {
      await db.query(`UPDATE ${table} SET place_id = $2::uuid WHERE world_name = $1 AND place_id IS NULL`, [
        worldName,
        placeId
      ])
    }
  }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const { table } of TABLES) {
    // Step 1: Add place_id column as nullable UUID so existing rows can be backfilled.
    await pgm.db.query(`ALTER TABLE ${table} ADD COLUMN place_id UUID`)
  }

  // Step 2: Backfill existing rows by resolving the first Places match for each distinct world_name.
  await backfillPlaceIds(pgm.db)

  for (const { table, newPkColumns } of TABLES) {
    // Step 3: Enforce NOT NULL once the backfill is complete.
    await pgm.db.query(`ALTER TABLE ${table} ALTER COLUMN place_id SET NOT NULL`)

    // Step 4: Swap the primary key to include place_id.
    const columnList = newPkColumns.join(', ')
    await pgm.db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`)
    await pgm.db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (${columnList})`)
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const { table, oldPkColumns } of TABLES) {
    // Restore the original primary key before removing place_id.
    const columnList = oldPkColumns.join(', ')
    await pgm.db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`)
    await pgm.db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (${columnList})`)

    // Drop place_id column once the original PK has been restored.
    await pgm.db.query(`ALTER TABLE ${table} DROP COLUMN place_id`)
  }
}
