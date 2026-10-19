import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { validateStorageKey } from './validateStorageKey'
import { isRecord } from '../../../utils/typeGuards'
import type { ExportSelection } from '../../../logic/storage-export/types'

const MAX_LIST_ENTRIES = 100

function parseObject(
  value: unknown,
  typeMessage: string,
  allowedFields: string[],
  fieldsMessage: string
): Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new InvalidRequestError(typeMessage)
  }
  if (Object.keys(value).some(field => !allowedFields.includes(field))) {
    throw new InvalidRequestError(fieldsMessage)
  }
  return value
}

function parseList(value: unknown, label: string): string[] | null {
  if (value === undefined) {
    return null
  }
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === 'string')) {
    throw new InvalidRequestError(`${label} must be an array of strings`)
  }
  if (value.length > MAX_LIST_ENTRIES) {
    throw new InvalidRequestError(`${label} must have at most ${MAX_LIST_ENTRIES} entries`)
  }
  return value
}

/** Parses the optional `POST /exports` body into a selection; an empty body selects everything. */
export function parseExportSelection(body: string): ExportSelection {
  if (!body.trim()) {
    return { worldKeys: null, playerAddresses: null, playerKeys: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new InvalidRequestError('Request body must be valid JSON')
  }

  const request = parseObject(
    parsed,
    'Request body must be a JSON object',
    ['world', 'players'],
    'Request body may only contain world and players'
  )
  const world =
    request.world === undefined
      ? {}
      : parseObject(request.world, 'world must be an object', ['keys'], 'world may only contain keys')
  const players =
    request.players === undefined
      ? {}
      : parseObject(
          request.players,
          'players must be an object',
          ['addresses', 'keys'],
          'players may only contain addresses and keys'
        )

  const worldKeys = parseList(world.keys, 'world.keys')
  const playerAddresses = parseList(players.addresses, 'players.addresses')?.map(address => address.toLowerCase())
  const playerKeys = parseList(players.keys, 'players.keys')

  for (const key of [...(worldKeys ?? []), ...(playerKeys ?? [])]) {
    validateStorageKey(key)
  }
  if (playerAddresses?.some(address => !EthAddress.validate(address))) {
    throw new InvalidRequestError('Invalid player address')
  }
  if (worldKeys?.length === 0 && (playerAddresses?.length === 0 || playerKeys?.length === 0)) {
    throw new InvalidRequestError('The selection is empty: nothing to export')
  }

  return { worldKeys, playerAddresses: playerAddresses ?? null, playerKeys }
}
