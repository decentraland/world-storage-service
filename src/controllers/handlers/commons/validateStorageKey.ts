import { InvalidRequestError } from '@dcl/http-commons'

/** Maximum key length in characters, matching the `varchar(255)` columns of every storage table. */
const MAX_KEY_LENGTH = 255

/**
 * Validates a storage key path parameter.
 *
 * Keys are stored in `varchar(255)` columns; without this check an oversized key passes
 * limits validation and then fails the INSERT with a generic database error (a 500),
 * while reads and deletes of the same key quietly return 404/204. Length is counted in
 * Unicode code points, matching how Postgres counts `varchar` length.
 *
 * @param key - The `:key` path parameter
 * @throws {InvalidRequestError} If the key is empty or longer than 255 characters
 */
export function validateStorageKey(key: string): void {
  if (!key || [...key].length > MAX_KEY_LENGTH) {
    throw new InvalidRequestError(`Key must be between 1 and ${MAX_KEY_LENGTH} characters`)
  }
}
