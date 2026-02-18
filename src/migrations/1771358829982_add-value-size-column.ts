import { calculateValueSizeInBytes } from '../utils/calculateValueSizeInBytes'
import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const JSONB_TABLES: Array<{ table: string; pkColumns: string[] }> = [
  { table: 'world_storage', pkColumns: ['world_name', 'key'] },
  { table: 'player_storage', pkColumns: ['world_name', 'player_address', 'key'] }
]

async function backfillJsonbValueSizes(db: MigrationBuilder['db'], table: string, pkColumns: string[]): Promise<void> {
  const whereClause = pkColumns.map((col, i) => `${col} = $${i + 1}`).join(' AND ')

  const { rows } = await db.query(`SELECT ${pkColumns.join(', ')}, value FROM ${table}`)

  for (const row of rows) {
    const size = calculateValueSizeInBytes(JSON.stringify(row.value))
    const pkValues = pkColumns.map(col => row[col])
    await db.query(`UPDATE ${table} SET value_size = $${pkColumns.length + 1} WHERE ${whereClause}`, [
      ...pkValues,
      size
    ])
  }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add columns via db.query so they exist before backfill runs.
  for (const { table } of [...JSONB_TABLES, { table: 'env_variables' }]) {
    await pgm.db.query(`ALTER TABLE ${table} ADD COLUMN value_size integer NOT NULL DEFAULT 0`)
  }

  // World/Player: use JSON.stringify (same as application) for exact byte length.
  for (const { table, pkColumns } of JSONB_TABLES) {
    await backfillJsonbValueSizes(pgm.db, table, pkColumns)
  }

  // Env: cannot decrypt in migration. Subtract fixed AES-256-GCM overhead (29 bytes:
  // 1 byte version + 12 bytes IV + 16 bytes auth tag) from encrypted column length.
  await pgm.db.query('UPDATE env_variables SET value_size = GREATEST(octet_length(value_enc) - 29, 0)')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('world_storage', 'value_size')
  pgm.dropColumn('player_storage', 'value_size')
  pgm.dropColumn('env_variables', 'value_size')
}
