import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { DecryptionError } from './errors'
import type { IEncryptionComponent } from './types'
import type { AppComponents } from '../../types'

/**
 * AES-256-GCM encryption constants.
 *
 * @remarks
 * - Algorithm: AES-256 in GCM mode (authenticated encryption)
 * - IV size: 12 bytes (96 bits) - recommended for GCM per NIST SP 800-38D
 * - Auth tag size: 16 bytes (128 bits) - maximum security
 * - Key size: 32 bytes (256 bits) - required for AES-256
 * - Format version: 1 byte prefix for future compatibility
 */

/** The encryption algorithm used (AES-256 in Galois/Counter Mode) */
const ALGORITHM = 'aes-256-gcm'

/**
 * Current format version for the encrypted payload.
 * Allows future changes to algorithm, IV length, or format without breaking existing data.
 */
const FORMAT_VERSION = 0x01

/** Length of the format version prefix in bytes */
const VERSION_LENGTH = 1

/** Length of the Initialization Vector in bytes (96 bits, recommended for GCM) */
const IV_LENGTH = 12

/** Length of the authentication tag in bytes (128 bits, maximum security) */
const AUTH_TAG_LENGTH = 16

/** Required length of the encryption key in bytes (256 bits for AES-256) */
const KEY_LENGTH = 32

/** Expected length of the hex-encoded encryption key (2 hex chars per byte) */
const KEY_HEX_LENGTH = KEY_LENGTH * 2

/** Regular expression to validate hexadecimal strings */
const HEX_REGEX = /^[0-9a-fA-F]+$/

/**
 * Creates an encryption component that provides AES-256-GCM encryption/decryption.
 *
 * This factory function initializes the encryption component with a secret key
 * from the configuration. The key must be exactly 32 bytes (64 hex characters).
 *
 * @param components - The application components containing the config
 * @param components.config - Configuration component to retrieve the ENCRYPTION_KEY
 * @returns A promise that resolves to the encryption component
 * @throws {Error} If ENCRYPTION_KEY is not set, has invalid length, or contains non-hex characters
 *
 * @example
 * ```typescript
 * // Generate a valid key: openssl rand -hex 32
 * const encryption = await createEncryptionComponent({ config })
 * ```
 *
 * @see {@link IEncryptionComponent} for the interface definition
 */
export async function createEncryptionComponent(
  components: Pick<AppComponents, 'config'>
): Promise<IEncryptionComponent> {
  const { config } = components

  const keyHex = await config.requireString('ENCRYPTION_KEY')

  // Validate hex format before parsing to provide clear error messages
  if (!HEX_REGEX.test(keyHex)) {
    throw new Error('Invalid ENCRYPTION_KEY: contains non-hexadecimal characters')
  }

  if (keyHex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `Invalid ENCRYPTION_KEY length: expected ${KEY_HEX_LENGTH} hexadecimal characters, got ${keyHex.length}`
    )
  }

  const key = Buffer.from(keyHex, 'hex')

  return {
    /**
     * Encrypts a plaintext string using AES-256-GCM.
     *
     * Generates a random IV for each encryption operation to ensure
     * semantic security.
     *
     * @param plaintext - The UTF-8 string to encrypt
     * @returns Buffer containing: version (1 byte) + IV (12 bytes) + ciphertext + authTag (16 bytes)
     */
    encrypt(plaintext: string): Buffer {
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv(ALGORITHM, key, iv)

      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

      const authTag = cipher.getAuthTag()

      // Format: version (1 byte) + IV (12 bytes) + ciphertext + authTag (16 bytes)
      return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, encrypted, authTag])
    },

    /**
     * Decrypts an encrypted buffer back to the original plaintext string.
     *
     * Extracts the version, IV, and authentication tag from the buffer, verifies
     * integrity via GCM authentication, and decrypts the ciphertext.
     *
     * @param encrypted - Buffer in format: version (1 byte) + IV (12 bytes) + ciphertext + authTag (16 bytes)
     * @returns The decrypted UTF-8 string
     * @throws {DecryptionError} If buffer is too short, version is unsupported, data is tampered, or key is incorrect
     */
    decrypt(encrypted: Buffer): string {
      const minLength = VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      if (encrypted.length < minLength) {
        throw new DecryptionError(
          `Invalid encrypted data: buffer too short (minimum ${minLength} bytes, got ${encrypted.length})`
        )
      }

      const version = encrypted[0]
      if (version !== FORMAT_VERSION) {
        throw new DecryptionError(`Unsupported encryption format version: ${version}`)
      }

      const iv = encrypted.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH)
      const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH)
      const ciphertext = encrypted.subarray(VERSION_LENGTH + IV_LENGTH, encrypted.length - AUTH_TAG_LENGTH)

      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

        return decrypted.toString('utf8')
      } catch {
        // Use generic message to avoid leaking internal crypto error details
        throw new DecryptionError('Decryption failed: data may be corrupted or encrypted with a different key')
      }
    }
  }
}
