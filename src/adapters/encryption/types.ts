export interface IEncryptionComponent {
  encrypt(plaintext: string): Buffer
  decrypt(encrypted: Buffer): string
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecryptionError'
  }
}
