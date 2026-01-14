import type { JSONValue } from '../../types/http'
import type { Schema } from 'ajv'

export interface UpsertStorageBody {
  value: JSONValue
}

export interface UpsertEnvStorageBody {
  value: string
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

export const UpsertStorageRequestSchema: Schema = {
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

export const UpsertEnvStorageRequestSchema: Schema = {
  type: 'object',
  properties: {
    value: { type: 'string' }
  },
  required: ['value'],
  additionalProperties: false
}
