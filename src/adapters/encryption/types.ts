/**
 * Interface for the encryption component that provides AES-256-GCM encryption/decryption capabilities.
 *
 * This component handles symmetric encryption of sensitive data such as environment variables,
 * using authenticated encryption to ensure both confidentiality and integrity.
 *
 * @example
 * ```typescript
 * const encryption = await createEncryptionComponent({ config })
 *
 * // Encrypt sensitive data
 * const encrypted = encryption.encrypt('my-secret-value')
 *
 * // Decrypt back to plaintext
 * const decrypted = encryption.decrypt(encrypted)
 * ```
 */
export interface IEncryptionComponent {
  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * The returned buffer contains the IV, ciphertext, and authentication tag,
   * all concatenated together for easy storage and transmission.
   *
   * @param plaintext - The string to encrypt
   * @returns A Buffer containing: IV (12 bytes) + ciphertext + authTag (16 bytes)
   */
  encrypt(plaintext: string): Buffer

  /**
   * Decrypts an encrypted buffer back to the original plaintext string.
   *
   * The buffer must be in the format produced by the `encrypt` method:
   * IV (12 bytes) + ciphertext + authTag (16 bytes).
   *
   * @param encrypted - The encrypted buffer to decrypt
   * @returns The original plaintext string
   * @throws {DecryptionError} If the buffer is too short, tampered with, or the key is incorrect
   */
  decrypt(encrypted: Buffer): string
}
