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
 * Rows are first deduplicated so the lowercasing UPDATE cannot violate the primary key:
 * within each group that collapses to the same `(lower(world_name), <key columns>)`, exactly
 * one row is kept and the rest are dropped. The survivor is chosen deterministically —
 * an already-lowercase row wins (it is the one clients using the canonical casing have been
 * reading and writing), otherwise the most recently updated row. This handles not just
 * "mixed-case + existing lowercase" but also several *distinct* mixed-case spellings of the
 * same world (`MyWorld` and `MYWORLD`) with no lowercase row, which the previous
 * prefer-existing-lowercase-only approach left to collide on UPDATE.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const { table, keyColumns } of TABLES) {
    const partitionColumns = keyColumns.join(', ')

    pgm.sql(`
      DELETE FROM ${table}
      WHERE ctid IN (
        SELECT ctid FROM (
          SELECT ctid,
            ROW_NUMBER() OVER (
              PARTITION BY lower(world_name), ${partitionColumns}
              ORDER BY (world_name = lower(world_name)) DESC, updated_at DESC, ctid
            ) AS rn
          FROM ${table}
        ) ranked
        WHERE ranked.rn > 1
      )`)

    pgm.sql(`UPDATE ${table} SET world_name = lower(world_name) WHERE world_name <> lower(world_name)`)
  }
}

export async function down(): Promise<void> {
  // Irreversible: the original casing (and any dropped mixed-case duplicates) cannot be
  // reconstructed. Rolling back the service is safe without reverting this data change,
  // since lowercase names were always valid inputs.
}
