import type { Schema } from 'ajv'

export const UpsertWorldStorageRequestSchema: Schema = {
  type: 'object',
  required: ['value'],
  additionalProperties: false
}
