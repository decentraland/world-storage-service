import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { DecryptionError } from './types'
import type { IEncryptionComponent } from './types'
import type { AppComponents } from '../../types'

/**
 * AES-256-GCM encryption constants
 *
 * - Algorithm: AES-256 in GCM mode (authenticated encryption)
 * - IV size: 12 bytes (96 bits) - recommended for GCM
 * - Auth tag size: 16 bytes (128 bits) - maximum security
 * - Key size: 32 bytes (256 bits)
 */
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

export async function createEncryptionComponent(
  components: Pick<AppComponents, 'config'>
): Promise<IEncryptionComponent> {
  const { config } = components

  const keyHex = await config.requireString('ENCRYPTION_KEY')
  const key = Buffer.from(keyHex, 'hex')

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Invalid ENCRYPTION_KEY length: expected ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters), got ${key.length} bytes`
    )
  }

  return {
    encrypt(plaintext: string): Buffer {
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv(ALGORITHM, key, iv)

      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

      const authTag = cipher.getAuthTag()

      // Format: IV (12 bytes) + ciphertext + authTag (16 bytes)
      return Buffer.concat([iv, encrypted, authTag])
    },

    decrypt(encrypted: Buffer): string {
      const minLength = IV_LENGTH + AUTH_TAG_LENGTH
      if (encrypted.length < minLength) {
        throw new DecryptionError(
          `Invalid encrypted data: buffer too short (minimum ${minLength} bytes, got ${encrypted.length})`
        )
      }

      const iv = encrypted.subarray(0, IV_LENGTH)
      const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH)
      const ciphertext = encrypted.subarray(IV_LENGTH, encrypted.length - AUTH_TAG_LENGTH)

      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

        return decrypted.toString('utf8')
      } catch (error) {
        throw new DecryptionError(`Decryption failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
  }
}
