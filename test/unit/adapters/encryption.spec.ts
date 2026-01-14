import { randomBytes } from 'crypto'
import { createEncryptionComponent } from '../../../src/adapters/encryption'
import { DecryptionError } from '../../../src/adapters/encryption/types'
import type { IEncryptionComponent } from '../../../src/adapters/encryption'
import type { AppComponents } from '../../../src/types'

describe('createEncryptionComponent', () => {
  const VALID_KEY_HEX = randomBytes(32).toString('hex')
  const IV_LENGTH = 12
  const AUTH_TAG_LENGTH = 16
  const MIN_ENCRYPTED_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH

  let configRequireString: jest.Mock
  let component: IEncryptionComponent

  beforeEach(async () => {
    configRequireString = jest.fn().mockResolvedValue(VALID_KEY_HEX)
    component = await createComponent()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  async function createComponent(): Promise<IEncryptionComponent> {
    return createEncryptionComponent({
      config: { requireString: configRequireString }
    } as unknown as Pick<AppComponents, 'config'>)
  }

  describe('when creating the component', () => {
    describe('and the encryption key has valid length', () => {
      it('should create the component successfully', () => {
        expect(component).toBeDefined()
        expect(component.encrypt).toBeDefined()
        expect(component.decrypt).toBeDefined()
      })
    })

    describe('and the encryption key is too short', () => {
      it('should throw an error with the expected key length', async () => {
        configRequireString.mockResolvedValue(randomBytes(16).toString('hex'))

        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY length: expected 32 bytes')
      })
    })

    describe('and the encryption key is too long', () => {
      it('should throw an error with the expected key length', async () => {
        configRequireString.mockResolvedValue(randomBytes(64).toString('hex'))

        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY length: expected 32 bytes')
      })
    })
  })

  describe('encrypt', () => {
    describe('when encrypting a plaintext string', () => {
      let plaintext: string
      let encrypted: Buffer

      beforeEach(() => {
        plaintext = 'my-secret-value'
        encrypted = component.encrypt(plaintext)
      })

      it('should return a buffer larger than the minimum due to ciphertext', () => {
        expect(encrypted.length).toBeGreaterThan(MIN_ENCRYPTED_LENGTH)
      })
    })

    describe('when encrypting an empty string', () => {
      let encrypted: Buffer

      beforeEach(() => {
        encrypted = component.encrypt('')
      })

      it('should return a buffer with exactly the minimum length', () => {
        expect(encrypted.length).toBe(MIN_ENCRYPTED_LENGTH)
      })
    })

    describe('when encrypting the same plaintext twice', () => {
      let plaintext: string
      let firstEncryption: Buffer
      let secondEncryption: Buffer

      beforeEach(() => {
        plaintext = 'same-secret'
        firstEncryption = component.encrypt(plaintext)
        secondEncryption = component.encrypt(plaintext)
      })

      it('should produce different ciphertexts due to random IV', () => {
        expect(firstEncryption.equals(secondEncryption)).toBe(false)
      })
    })

    describe('when encrypting unicode characters', () => {
      let plaintext: string
      let encrypted: Buffer

      beforeEach(() => {
        plaintext = '🔐 contraseña секрет 密码'
        encrypted = component.encrypt(plaintext)
      })

      it('should return a valid encrypted buffer', () => {
        expect(encrypted.length).toBeGreaterThan(MIN_ENCRYPTED_LENGTH)
      })
    })
  })

  describe('decrypt', () => {
    describe('when decrypting a valid encrypted buffer', () => {
      let plaintext: string
      let decrypted: string

      beforeEach(() => {
        plaintext = 'my-secret-value'
        const encrypted = component.encrypt(plaintext)
        decrypted = component.decrypt(encrypted)
      })

      it('should return the original plaintext', () => {
        expect(decrypted).toBe(plaintext)
      })
    })

    describe('when decrypting an empty string encryption', () => {
      let decrypted: string

      beforeEach(() => {
        const encrypted = component.encrypt('')
        decrypted = component.decrypt(encrypted)
      })

      it('should return an empty string', () => {
        expect(decrypted).toBe('')
      })
    })

    describe('when decrypting unicode content', () => {
      let plaintext: string
      let decrypted: string

      beforeEach(() => {
        plaintext = '🔐 contraseña секрет 密码'
        const encrypted = component.encrypt(plaintext)
        decrypted = component.decrypt(encrypted)
      })

      it('should preserve the original unicode characters', () => {
        expect(decrypted).toBe(plaintext)
      })
    })

    describe('when the encrypted buffer is too short', () => {
      let shortBuffer: Buffer

      beforeEach(() => {
        shortBuffer = Buffer.alloc(MIN_ENCRYPTED_LENGTH - 1)
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(shortBuffer)).toThrow(DecryptionError)
      })

      it('should include the buffer length in the error message', () => {
        expect(() => component.decrypt(shortBuffer)).toThrow(`got ${shortBuffer.length}`)
      })
    })

    describe('when the ciphertext has been tampered with', () => {
      let tamperedBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('original-secret')
        tamperedBuffer = Buffer.from(encrypted)
        // Tamper with the ciphertext (middle portion)
        const ciphertextStart = IV_LENGTH
        tamperedBuffer[ciphertextStart] = tamperedBuffer[ciphertextStart] ^ 0xff
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(tamperedBuffer)).toThrow(DecryptionError)
      })
    })

    describe('when the auth tag has been tampered with', () => {
      let tamperedBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('original-secret')
        tamperedBuffer = Buffer.from(encrypted)
        // Tamper with the auth tag (last 16 bytes)
        const authTagStart = tamperedBuffer.length - AUTH_TAG_LENGTH
        tamperedBuffer[authTagStart] = tamperedBuffer[authTagStart] ^ 0xff
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(tamperedBuffer)).toThrow(DecryptionError)
      })
    })

    describe('when the IV has been tampered with', () => {
      let tamperedBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('original-secret')
        tamperedBuffer = Buffer.from(encrypted)
        // Tamper with the IV (first 12 bytes)
        tamperedBuffer[0] = tamperedBuffer[0] ^ 0xff
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(tamperedBuffer)).toThrow(DecryptionError)
      })
    })

    describe('when using a different encryption key', () => {
      let differentKeyComponent: IEncryptionComponent
      let encrypted: Buffer

      beforeEach(async () => {
        encrypted = component.encrypt('secret-data')

        // Create a new component with a different key
        configRequireString.mockResolvedValue(randomBytes(32).toString('hex'))
        differentKeyComponent = await createComponent()
      })

      it('should throw a DecryptionError', () => {
        expect(() => differentKeyComponent.decrypt(encrypted)).toThrow(DecryptionError)
      })
    })
  })
})
