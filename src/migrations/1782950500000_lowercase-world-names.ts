import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const TABLES: Array<{ table: string; keyColumns: string[] }> = [
  { table: 'world_storage', keyColumns: ['place_id', 'key'] },
  { table: 'player_storage', keyColumns: ['place_id', 'player_address', 'key'] },
  { table: 'env_variables', keyColumns: ['place_id', 'key'] }
]

/**
 * Lowercases every stored `world_name`.
 *
 * The scene-context middleware now lowercases realm names before they reach storage, so
 * any pre-existing row written with a mixed-case realm (`MyWorld.dcl.eth`) would otherwise
 * become permanently unreachable — reads 404, deletes no-op — while still occupying disk.
 *
 * When both casings of the same logical row exist, the lowercase row wins: it is the one
 * clients using the canonical casing have been reading and writing all along, and it is
 * the only one addressable after this deploy. The mixed-case duplicate is dropped first
 * so the UPDATE cannot violate the primary key.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const { table, keyColumns } of TABLES) {
    const sameKey = keyColumns.map(column => `duplicate.${column} = mixed.${column}`).join(' AND ')

    pgm.sql(`
      DELETE FROM ${table} mixed
      USING ${table} duplicate
      WHERE mixed.world_name <> lower(mixed.world_name)
        AND duplicate.world_name = lower(mixed.world_name)
        AND ${sameKey}`)

    pgm.sql(`UPDATE ${table} SET world_name = lower(world_name) WHERE world_name <> lower(world_name)`)
  }
}

export async function down(): Promise<void> {
  // Irreversible: the original casing (and any dropped mixed-case duplicates) cannot be
  // reconstructed. Rolling back the service is safe without reverting this data change,
  // since lowercase names were always valid inputs.
}
