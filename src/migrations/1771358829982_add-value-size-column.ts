import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('world_storage', {
    value_size: {
      type: 'integer',
      notNull: true,
      default: 0
    }
  })

  pgm.addColumn('player_storage', {
    value_size: {
      type: 'integer',
      notNull: true,
      default: 0
    }
  })

  pgm.addColumn('env_variables', {
    value_size: {
      type: 'integer',
      notNull: true,
      default: 0
    }
  })

  // Backfill existing rows with approximate sizes.
  // World/Player: octet_length(value::text) measures the JSON text representation.
  // This slightly overcounts vs JSON.stringify due to PG adding spaces in JSON output,
  // but only affects pre-existing data. New writes will store exact byte lengths.
  pgm.sql('UPDATE world_storage SET value_size = octet_length(value::text)')
  pgm.sql('UPDATE player_storage SET value_size = octet_length(value::text)')

  // Env: subtract the fixed AES-256-GCM encryption overhead (29 bytes per value:
  // 1 byte version + 12 bytes IV + 16 bytes auth tag) from the encrypted column length.
  pgm.sql('UPDATE env_variables SET value_size = GREATEST(octet_length(value_enc) - 29, 0)')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('world_storage', 'value_size')
  pgm.dropColumn('player_storage', 'value_size')
  pgm.dropColumn('env_variables', 'value_size')
}
