import { InvalidRequestError } from '@dcl/http-commons'
import { parseExportSelection } from '../../../../../src/controllers/handlers/commons/parseExportSelection'
import type { ExportSelection } from '../../../../../src/logic/storage-export/types'

const ALL: ExportSelection = { worldKeys: null, playerAddresses: null, playerKeys: null }
const MIXED_CASE_ADDRESS = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

describe('parseExportSelection', () => {
  let body: string

  describe.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['an empty object', '{}']
  ])('when the body is %s', (_label, text) => {
    beforeEach(() => {
      body = text
    })

    it('should select everything', () => {
      expect(parseExportSelection(body)).toEqual(ALL)
    })
  })

  describe('when the body selects world keys', () => {
    beforeEach(() => {
      body = '{"world":{"keys":["a","b"]}}'
    })

    it('should return those world keys and select every player row', () => {
      expect(parseExportSelection(body)).toEqual({ worldKeys: ['a', 'b'], playerAddresses: null, playerKeys: null })
    })
  })

  describe('when the body selects player addresses with no player keys', () => {
    beforeEach(() => {
      body = JSON.stringify({ players: { addresses: [MIXED_CASE_ADDRESS], keys: [] } })
    })

    it('should lowercase the address and keep the empty key list', () => {
      expect(parseExportSelection(body)).toEqual({
        worldKeys: null,
        playerAddresses: [MIXED_CASE_ADDRESS.toLowerCase()],
        playerKeys: []
      })
    })
  })

  describe('when the world object has no keys field', () => {
    beforeEach(() => {
      body = '{"world":{}}'
    })

    it('should select every world key', () => {
      expect(parseExportSelection(body)).toEqual(ALL)
    })
  })

  describe.each([
    ['not JSON', 'not json', 'Request body must be valid JSON'],
    ['an array', '[]', 'Request body must be a JSON object'],
    ['null', 'null', 'Request body must be a JSON object'],
    ['a number', '1', 'Request body must be a JSON object'],
    ['an object with an unknown property', '{"extra":1}', 'Request body may only contain world and players'],
    ['a world with an unknown property', '{"world":{"other":[]}}', 'world may only contain keys'],
    ['players with an unknown property', '{"players":{"other":[]}}', 'players may only contain addresses and keys'],
    ['a world that is an array', '{"world":[]}', 'world must be an object'],
    ['players that is a string', '{"players":"x"}', 'players must be an object'],
    ['world keys that are a string', '{"world":{"keys":"a"}}', 'world.keys must be an array of strings'],
    ['world keys holding a number', '{"world":{"keys":[1]}}', 'world.keys must be an array of strings'],
    [
      'player addresses that are a string',
      '{"players":{"addresses":"a"}}',
      'players.addresses must be an array of strings'
    ],
    ['player keys holding a number', '{"players":{"keys":[1]}}', 'players.keys must be an array of strings'],
    ['an invalid player address', '{"players":{"addresses":["0x123"]}}', 'Invalid player address'],
    ['an empty key', '{"world":{"keys":[""]}}', 'Key must be between 1 and 255 characters'],
    [
      'a key longer than 255 characters',
      JSON.stringify({ players: { keys: ['a'.repeat(256)] } }),
      'Key must be between 1 and 255 characters'
    ],
    [
      'no world keys and no player addresses',
      '{"world":{"keys":[]},"players":{"addresses":[]}}',
      'The selection is empty: nothing to export'
    ],
    [
      'no world keys and no player keys',
      '{"world":{"keys":[]},"players":{"keys":[]}}',
      'The selection is empty: nothing to export'
    ]
  ])('when the body is %s', (_label, text, message) => {
    beforeEach(() => {
      body = text
    })

    it('should throw an InvalidRequestError with the matching message', () => {
      expect(() => parseExportSelection(body)).toThrow(new InvalidRequestError(message))
    })
  })

  describe.each([
    ['world.keys', (entries: string[]) => ({ world: { keys: entries } })],
    ['players.addresses', (entries: string[]) => ({ players: { addresses: entries } })],
    ['players.keys', (entries: string[]) => ({ players: { keys: entries } })]
  ])('when %s has 101 entries', (label, build) => {
    beforeEach(() => {
      body = JSON.stringify(
        build(Array.from({ length: 101 }, (_, index) => `0x${index.toString(16).padStart(40, '0')}`))
      )
    })

    it('should throw an InvalidRequestError with the list limit', () => {
      expect(() => parseExportSelection(body)).toThrow(
        new InvalidRequestError(`${label} must have at most 100 entries`)
      )
    })
  })
})
