export interface IEncryptionComponent {
  encrypt(plaintext: string): Buffer
  decrypt(encrypted: Buffer): string
}
