import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

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

  describe('and application and polling roles have only documented capture grants', () => {
    let appRole: string
    let readerRole: string

    beforeEach(() => {
      appRole = `capture_app_${randomUUID().replace(/-/g, '')}`
      readerRole = `capture_reader_${randomUUID().replace(/-/g, '')}`
      sql(`CREATE ROLE ${appRole}; CREATE ROLE ${readerRole};
        GRANT USAGE ON SCHEMA public TO ${appRole};
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_storage TO ${appRole};
        GRANT USAGE ON SCHEMA migration_player_capture TO ${appRole}, ${readerRole};
        GRANT EXECUTE ON FUNCTION migration_player_capture.lock_capture(),
          migration_player_capture.apply_command(text,text,uuid,text,text,text,text) TO ${appRole};
        GRANT SELECT ON migration_player_capture.control, migration_player_capture.scope,
          migration_player_capture.transactions TO ${readerRole};`)
    })

    afterEach(() => {
      sql(`DROP OWNED BY ${appRole}, ${readerRole}; DROP ROLE ${appRole}; DROP ROLE ${readerRole};`)
    })

    it('should allow the application to commit accepted commands through the definer function', () => {
      expect(() =>
        sql(`SET ROLE ${appRole}; BEGIN; SELECT migration_player_capture.lock_capture(); ${command} COMMIT;`)
      ).not.toThrow()
      expect(sql('SELECT count(*) FROM migration_player_capture.transactions WHERE NOT unclassified')).toBe('1')
    })

    it('should prevent the application from editing acceptance evidence or scope', () => {
      expect(() =>
        sql(`SET ROLE ${appRole}; UPDATE migration_player_capture.transactions SET unclassified=false`)
      ).toThrow()
      expect(() =>
        sql(`SET ROLE ${appRole}; UPDATE migration_player_capture.scope SET scene_id='replacement'`)
      ).toThrow()
      expect(() => sql(`SET ROLE ${appRole}; UPDATE migration_player_capture.control SET sealed=false`)).toThrow()
    })

    it('should allow polling reads without permitting mutation or accepted-command execution', () => {
      expect(() =>
        sql(`SET ROLE ${readerRole}; SELECT * FROM migration_player_capture.control;
        SELECT * FROM migration_player_capture.scope; SELECT * FROM migration_player_capture.transactions;`)
      ).not.toThrow()
      expect(() => sql(`SET ROLE ${readerRole}; ${command}`)).toThrow()
      expect(() =>
        sql(`SET ROLE ${readerRole}; UPDATE migration_player_capture.transactions SET unclassified=false`)
      ).toThrow()
    })

    it('should require a separate baseline grant to read source player data', () => {
      expect(() => sql(`SET ROLE ${readerRole}; SELECT * FROM public.player_storage`)).toThrow()
      sql(`GRANT USAGE ON SCHEMA public TO ${readerRole}; GRANT SELECT ON public.player_storage TO ${readerRole};`)
      expect(() => sql(`SET ROLE ${readerRole}; SELECT * FROM public.player_storage`)).not.toThrow()
    })
  })

  describe('and a source transaction holds capture ordering until rollback', () => {
    let holder: ChildProcessWithoutNullStreams
    let holderDone: Promise<number | null>
    let availableBefore: string
    let availableAfter: string
    let output: string

    beforeEach(async () => {
      output = ''
      holder = spawn('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--dbname', url])
      holderDone = new Promise((resolve, reject) => {
        holder.once('error', reject)
        holder.once('exit', resolve)
      })
      await new Promise<void>((resolve, reject) => {
        holder.once('error', reject)
        holder.once('exit', () => reject(new Error('lock holder exited before taking capture lock')))
        holder.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString()
          if (output.includes('CAPTURE_LOCKED')) resolve()
        })
        holder.stdin.write(`BEGIN; ${command}
\\echo CAPTURE_LOCKED
`)
      })
      availableBefore = sql('SELECT pg_try_advisory_xact_lock(179323,1)')
      holder.stdin.end('ROLLBACK;\n')
      await holderDone
      availableAfter = sql('SELECT pg_try_advisory_xact_lock(179323,1)')
    })

    afterEach(async () => {
      if (holder.exitCode === null) {
        holder.kill()
        await holderDone
      }
    })

    it('should serialize competing capture and release its lock without retaining rolled-back evidence', () => {
      expect(availableBefore).toBe('f')
      expect(availableAfter).toBe('t')
      expect(sql('SELECT count(*) FROM migration_player_capture.transactions')).toBe('0')
    })
  })
})
