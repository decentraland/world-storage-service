import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Explicit disposable PostgreSQL server with CREATEDB permission; never use an application DB.
const serverUrl = process.env.MIGRATION_PLAYER_TEST_DATABASE_URL
const describeDatabase = serverUrl ? describe : describe.skip

describeDatabase('when player command capture is installed in a disposable database', () => {
  let database: string
  let url: string
  let world: string
  let place: string
  let player: string
  let command: string
  let result: string

  function sql(statement: string, connection = url): string {
    return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--dbname', connection], {
      input: statement,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  }

  beforeEach(() => {
    database = `player_capture_${randomUUID().replace(/-/g, '')}`
    url = String(serverUrl).replace(/\/[^/]*$/, `/${database}`)
    world = 'example.dcl.eth'
    place = '11111111-1111-4111-8111-111111111111'
    player = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    command = `SELECT migration_player_capture.apply_command('set','${world}','${place}','scene-one','${player}','score','{"score": 1}');`
    sql(`CREATE DATABASE ${database}`, serverUrl)
    sql(`CREATE TABLE public.player_storage (
      world_name varchar(255) NOT NULL, place_id uuid NOT NULL, player_address varchar(255) NOT NULL,
      key varchar(255) NOT NULL, value jsonb NOT NULL, value_size integer NOT NULL,
      created_at timestamp NOT NULL, updated_at timestamp NOT NULL,
      PRIMARY KEY(world_name,place_id,player_address,key));`)
    sql(readFileSync(resolve(__dirname, '../../../scripts/hybrid-player-capture.sql'), 'utf8'))
    sql(`INSERT INTO migration_player_capture.scope VALUES ('${world}','${place}','scene-one');
      SELECT migration_player_capture.seal_scope();`)
  })

  afterEach(() => {
    sql(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`, serverUrl)
  })

  describe('and an accepted set commits', () => {
    beforeEach(() => {
      sql(command)
      result = sql(`SELECT (command->>'value_text'='{"score": 1}') AND
        (command->>'value_size')::integer=12 AND NOT unclassified
        AND command->>'scene_id'='scene-one' AND command->>'op'='set'
        AND command->>'created_at'=command->>'updated_at'
        FROM migration_player_capture.transactions WHERE position=1`)
    })

    it('should preserve serialized value bytes and accepted scene identity', () => {
      expect(result).toBe('t')
    })
  })

  describe('and the enclosing operation rolls back', () => {
    beforeEach(() => {
      sql(`BEGIN; ${command} ROLLBACK;`)
      result = sql(`SELECT (SELECT count(*) FROM player_storage)=0
        AND (SELECT count(*) FROM migration_player_capture.transactions)=0
        AND (SELECT position FROM migration_player_capture.control)=0`)
    })

    it('should roll back the value and its acceptance together', () => {
      expect(result).toBe('t')
    })
  })

  describe('and delete and clear operations affect no rows', () => {
    beforeEach(() => {
      sql(`SELECT migration_player_capture.apply_command('delete','${world}','${place}','scene-one','${player}','absent',NULL);
        SELECT migration_player_capture.apply_command('clear_player','${world}','${place}','scene-one','${player}',NULL,NULL);
        SELECT migration_player_capture.apply_command('clear_scene','${world}','${place}','scene-one',NULL,NULL,NULL);`)
      result = sql(`SELECT string_agg(command->>'op',',' ORDER BY position)
        FROM migration_player_capture.transactions WHERE NOT unclassified`)
    })

    it('should retain every accepted operation in order', () => {
      expect(result).toBe('delete,clear_player,clear_scene')
    })
  })

  describe('and a clear follows an accepted write', () => {
    beforeEach(() => {
      sql(command)
      sql(
        `SELECT migration_player_capture.apply_command('clear_scene','${world}','${place}','scene-one',NULL,NULL,NULL)`
      )
      result = sql(`SELECT (SELECT count(*) FROM player_storage)=0
        AND (SELECT string_agg(command->>'op',',' ORDER BY position) FROM migration_player_capture.transactions)='set,clear_scene'
        AND NOT EXISTS(SELECT 1 FROM migration_player_capture.transactions WHERE unclassified)`)
    })

    it('should classify the delete rows as part of the clear command', () => {
      expect(result).toBe('t')
    })
  })

  describe('and a writer bypasses accepted commands', () => {
    beforeEach(() => {
      sql(command)
      sql(`DELETE FROM public.player_storage`)
      result = sql(
        `SELECT unclassified AND command IS NULL FROM migration_player_capture.transactions WHERE position=2`
      )
    })

    it('should retain unclassified evidence instead of silently copying rows', () => {
      expect(result).toBe('t')
    })
  })

  describe('and the caller does not provide scene evidence', () => {
    beforeEach(() => {
      sql(command.replace("'scene-one'", 'NULL'))
      result = sql(`SELECT unclassified AND command IS NULL AND (SELECT count(*) FROM player_storage)=1
        FROM migration_player_capture.transactions WHERE position=1`)
    })

    it('should preserve production writes while blocking replay classification', () => {
      expect(result).toBe('t')
    })
  })

  describe('and a single source transaction contains multiple commands', () => {
    beforeEach(() => {
      sql(`BEGIN; ${command} ${command} COMMIT;`)
      result = sql(`SELECT unclassified FROM migration_player_capture.transactions WHERE position=1`)
    })

    it('should mark the unsupported aggregate transaction unclassified', () => {
      expect(result).toBe('t')
    })
  })

  describe('and a command addresses an unselected world', () => {
    beforeEach(() => {
      sql(command.replace(world, 'outside.dcl.eth'))
      result = sql(`SELECT (SELECT count(*) FROM player_storage)=1 AND
        (SELECT count(*) FROM migration_player_capture.transactions)=0`)
    })

    it('should persist normally without adding a replay operation', () => {
      expect(result).toBe('t')
    })
  })

  describe('and the operation is missing', () => {
    beforeEach(() => {
      sql(command)
      command = `SELECT migration_player_capture.apply_command(NULL,'${world}','${place}','scene-one',NULL,NULL,NULL)`
    })

    it('should reject the call instead of clearing scene values', () => {
      expect(() => sql(command)).toThrow()
      expect(sql('SELECT count(*) FROM player_storage')).toBe('1')
    })
  })

  describe('and the operator changes a sealed scope', () => {
    it('should reject the scope change', () => {
      expect(() => sql("UPDATE migration_player_capture.scope SET scene_id='replacement'")).toThrow()
    })
  })

  describe('and a writer truncates player data', () => {
    it('should reject the uncapturable operation', () => {
      expect(() => sql('TRUNCATE player_storage')).toThrow()
    })
  })
})
