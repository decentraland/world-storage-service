/* eslint-disable camelcase */

exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.createTable('player_storage', {
    world_name: {
      type: 'varchar(255)',
      notNull: true
    },
    player_address: {
      type: 'varchar(255)',
      notNull: true
    },
    key: {
      type: 'varchar(255)',
      notNull: true
    },
    value: {
      type: 'jsonb',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  })

  // Create composite primary key
  // The primary key index (world_name, player_address, key) can efficiently handle:
  // - Queries on world_name alone
  // - Queries on (world_name, player_address) together
  pgm.addConstraint('player_storage', 'player_storage_pkey', {
    primaryKey: ['world_name', 'player_address', 'key']
  })
}

exports.down = (pgm) => {
  pgm.dropTable('player_storage')
}
