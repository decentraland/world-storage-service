import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Covering indexes for the per-write storage-size aggregation.
 *
 * Every upsert validates limits by running, on the affected scope:
 *   SELECT MAX(value_size) FILTER (WHERE key = $key), SUM(value_size) FROM <table> WHERE <scope>
 *
 * The primary keys lead with the scope columns but do not carry `value_size`, so today this scans
 * the scope's rows and fetches `value_size` from the heap for each one. Adding `value_size` (and
 * `key`, needed by the FILTER) as INCLUDE payload lets the aggregation run as an index-only scan,
 * removing the per-write heap traffic that grows with the size of the world / player scope.
 *
 * Aggregation scopes:
 *   - world_storage:   WHERE world_name = ?
 *   - player_storage:  WHERE world_name = ? AND player_address = ?
 *   - env_variables:   WHERE world_name = ?
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('CREATE INDEX world_storage_size_idx ON world_storage (world_name) INCLUDE (key, value_size)')
  pgm.sql(
    'CREATE INDEX player_storage_size_idx ON player_storage (world_name, player_address) INCLUDE (key, value_size)'
  )
  pgm.sql('CREATE INDEX env_variables_size_idx ON env_variables (world_name) INCLUDE (key, value_size)')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS world_storage_size_idx')
  pgm.sql('DROP INDEX IF EXISTS player_storage_size_idx')
  pgm.sql('DROP INDEX IF EXISTS env_variables_size_idx')
}
