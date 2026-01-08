import type { JSONValue } from '../../types/http'
import type { Schema } from 'ajv'

export interface UpsertWorldStorageBody {
  value: JSONValue
}

const jsonValueSchema: Schema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'null' },
    { type: 'array', items: { $ref: '#/$defs/JSONValue' } },
    { type: 'object', additionalProperties: { $ref: '#/$defs/JSONValue' } }
  ]
}

export const UpsertWorldStorageRequestSchema: Schema = {
  type: 'object',
  $defs: {
    JSONValue: jsonValueSchema
  },
  properties: {
    value: { $ref: '#/$defs/JSONValue' }
  },
  required: ['value'],
  additionalProperties: false
}
