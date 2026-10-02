import { randomUUID } from 'crypto'
import { SQL } from 'sql-template-strings'
import { createConfigMockedComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'
import { type IPgComponent, createPgComponent } from '@dcl/pg-component'
import { createPlacesComponent } from '../../../src/adapters/places'
import { createCacheMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type { IPlacesComponent } from '../../../src/adapters/places/types'

const HOST = process.env.PLACES_PG_COMPONENT_PSQL_HOST ?? 'localhost'
const PORT = process.env.PLACES_PG_COMPONENT_PSQL_PORT ?? '5432'
const DATABASE = process.env.PLACES_PG_COMPONENT_PSQL_DATABASE ?? 'places'
const ADMIN_USER = process.env.PLACES_IT_ADMIN_USER ?? 'postgres'
const ADMIN_PASSWORD = process.env.PLACES_IT_ADMIN_PASSWORD ?? 'postgres'
const RO_USER = 'wss_readonly_it'
const RO_PASSWORD = 'wss_readonly_it_pw'

function connectionString(user: string, password: string): string {
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${HOST}:${PORT}/${DATABASE}`
}

const SCHEMA_DDL = `
  DROP VIEW IF EXISTS place_scene_resolution;
  DROP TABLE IF EXISTS place_positions;
  DROP TABLE IF EXISTS places;

  CREATE TABLE places (
    id uuid PRIMARY KEY,
    world boolean NOT NULL DEFAULT false,
    world_name text,
    base_position varchar(15),
    positions varchar(15)[] NOT NULL DEFAULT '{}',
    disabled boolean NOT NULL DEFAULT false,
    disabled_reason varchar(20)
  );

  CREATE TABLE place_positions (
    position varchar(15) PRIMARY KEY,
    base_position varchar(15) NOT NULL
  );

  CREATE VIEW place_scene_resolution WITH (security_barrier = true) AS
  SELECT
    p.id AS place_id,
    TRUE AS world,
    lower(p.world_name) AS world_name,
    unnest(p.positions) AS position
  FROM places p
  WHERE p.world IS TRUE
    AND (p.disabled IS FALSE OR p.disabled_reason = 'opt_out')
  UNION ALL
  SELECT
    p.id AS place_id,
    FALSE AS world,
    NULL::text AS world_name,
    pp.position AS position
  FROM places p
  JOIN place_positions pp ON pp.base_position = p.base_position
  WHERE p.world IS FALSE
    AND p.disabled IS FALSE;

  REVOKE ALL ON place_scene_resolution FROM PUBLIC;
`

const READONLY_GRANTS = `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RO_USER}') THEN
      CREATE ROLE ${RO_USER} LOGIN PASSWORD '${RO_PASSWORD}';
    ELSE
      ALTER ROLE ${RO_USER} LOGIN PASSWORD '${RO_PASSWORD}';
    END IF;
  END $$;

  GRANT CONNECT ON DATABASE "${DATABASE}" TO ${RO_USER};
  GRANT USAGE ON SCHEMA public TO ${RO_USER};
  GRANT SELECT ON place_scene_resolution TO ${RO_USER};
`

async function makePg(user: string, password: string): Promise<IPgComponent> {
  const config = createConfigMockedComponent({
    getString: jest.fn().mockResolvedValue(undefined),
    getNumber: jest.fn().mockResolvedValue(undefined)
  })
  const pg = await createPgComponent(
    { config, logs: createLogsMockedComponent() },
    { pool: { connectionString: connectionString(user, password) } }
  )
  await pg.start()
  return pg
}

describe('resolving place ids against the place_scene_resolution view over SQL (read-only user)', () => {
  const optOutWorldId = randomUUID()
  const activeGenesisId = randomUUID()
  const moderatedWorldId = randomUUID()

  let adminPg: IPgComponent
  let readonlyPg: IPgComponent
  let places: IPlacesComponent

  beforeAll(async () => {
    adminPg = await makePg(ADMIN_USER, ADMIN_PASSWORD)
    await adminPg.query(SCHEMA_DDL)
    await adminPg.query(READONLY_GRANTS)

    const cache = createCacheMockedComponent()
    cache.get.mockResolvedValue(null)

    readonlyPg = await makePg(RO_USER, RO_PASSWORD)
    places = await createPlacesComponent({
      placesPg: readonlyPg,
      config: createConfigMockedComponent({ getNumber: jest.fn().mockResolvedValue(undefined) }),
      cache,
      logs: createLogsMockedComponent()
    })
  })

  beforeEach(async () => {
    await adminPg.query(
      SQL`INSERT INTO places (id, world, world_name, base_position, positions, disabled, disabled_reason)
          VALUES (${optOutWorldId}::uuid, TRUE, 'Alpha.dcl.eth', '0,0', ARRAY['10,20']::varchar[], TRUE, 'opt_out')`
    )
    await adminPg.query(
      SQL`INSERT INTO places (id, world, world_name, base_position, positions, disabled, disabled_reason)
          VALUES (${moderatedWorldId}::uuid, TRUE, 'Banned.dcl.eth', '0,0', ARRAY['99,99']::varchar[], TRUE, 'moderation')`
    )
    await adminPg.query(
      SQL`INSERT INTO places (id, world, base_position, positions, disabled)
          VALUES (${activeGenesisId}::uuid, FALSE, '30,40', ARRAY['30,40','30,41']::varchar[], FALSE)`
    )
    await adminPg.query(
      SQL`INSERT INTO place_positions (position, base_position)
          VALUES ('30,40', '30,40'), ('30,41', '30,40')`
    )
  })

  afterEach(async () => {
    await adminPg.query('TRUNCATE places, place_positions')
  })

  afterAll(async () => {
    await adminPg?.query(`REVOKE ALL ON place_scene_resolution FROM ${RO_USER}`).catch(() => undefined)
    await readonlyPg?.stop()
    await adminPg?.stop()
  })

  describe('and the scene is an opted-out world', () => {
    it('should resolve its place id by world name and parcel', async () => {
      const placeId = await places.resolvePlaceId('Alpha.dcl.eth', '10,20')
      expect(placeId).toBe(optOutWorldId)
    })

    it('should resolve regardless of the requested world-name casing', async () => {
      const placeId = await places.resolvePlaceId('ALPHA.DCL.ETH', '10,20')
      expect(placeId).toBe(optOutWorldId)
    })
  })

  describe('and the scene is an active Genesis City place', () => {
    it('should resolve its place id by any occupied parcel', async () => {
      expect(await places.resolvePlaceId('main', '30,40')).toBe(activeGenesisId)
      expect(await places.resolvePlaceId('main', '30,41')).toBe(activeGenesisId)
    })
  })

  describe('and the scene is disabled for a reason other than opt_out', () => {
    it('should not resolve a moderated world scene', async () => {
      await expect(places.resolvePlaceId('Banned.dcl.eth', '99,99')).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the scene is unknown', () => {
    it('should throw an InvalidRequestError', async () => {
      await expect(places.resolvePlaceId('main', '1,1')).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('privacy: the read-only user', () => {
    it('should be able to read the resolution view', async () => {
      const result = await readonlyPg.query('SELECT count(*)::int AS n FROM place_scene_resolution')
      expect(result.rows[0].n).toBeGreaterThan(0)
    })

    it('should NOT be able to read the underlying places table', async () => {
      await expect(readonlyPg.query('SELECT id FROM places')).rejects.toThrow(/permission denied/i)
    })

    it('should NOT be able to read the underlying place_positions table', async () => {
      await expect(readonlyPg.query('SELECT position FROM place_positions')).rejects.toThrow(/permission denied/i)
    })
  })
})
