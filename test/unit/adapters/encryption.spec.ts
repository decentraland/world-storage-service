import { randomBytes } from 'crypto'
import { DecryptionError, createEncryptionComponent } from '../../../src/adapters/encryption'
import { createLogsMockedComponent } from '../../mocks/components'
import type { IEncryptionComponent } from '../../../src/adapters/encryption'
import type { AppComponents } from '../../../src/types'

describe('Encryption Component', () => {
  const VALID_KEY_HEX = randomBytes(32).toString('hex')
  const VERSION_LENGTH = 1
  const IV_LENGTH = 12
  const AUTH_TAG_LENGTH = 16
  const MIN_ENCRYPTED_LENGTH = VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH

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
      config: { requireString: configRequireString },
      logs: createLogsMockedComponent()
    } as unknown as Pick<AppComponents, 'config' | 'logs'>)
  }

  describe('when creating the component', () => {
    describe('and the encryption key is valid', () => {
      it('should create the component successfully', () => {
        expect(component).toBeDefined()
        expect(component.encrypt).toBeDefined()
        expect(component.decrypt).toBeDefined()
      })
    })

    describe('and the encryption key is too short', () => {
      beforeEach(() => {
        configRequireString.mockResolvedValue(randomBytes(16).toString('hex'))
      })

      it('should throw an error with the expected key length', async () => {
        await expect(createComponent()).rejects.toThrow(
          'Invalid ENCRYPTION_KEY length: expected 64 hexadecimal characters'
        )
      })
    })

    describe('and the encryption key is too long', () => {
      beforeEach(() => {
        configRequireString.mockResolvedValue(randomBytes(64).toString('hex'))
      })

      it('should throw an error with the expected key length', async () => {
        await expect(createComponent()).rejects.toThrow(
          'Invalid ENCRYPTION_KEY length: expected 64 hexadecimal characters'
        )
      })
    })

    describe('and the encryption key contains non-hex characters', () => {
      beforeEach(() => {
        // Replace first two characters with non-hex 'zz'
        configRequireString.mockResolvedValue('zz' + randomBytes(31).toString('hex'))
      })

      it('should throw an error indicating invalid characters', async () => {
        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY: contains non-hexadecimal characters')
      })
    })

    describe('and the encryption key has a 0x prefix', () => {
      beforeEach(() => {
        configRequireString.mockResolvedValue('0x' + randomBytes(32).toString('hex'))
      })

      it('should throw an error indicating invalid characters', async () => {
        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY: contains non-hexadecimal characters')
      })
    })

    describe('and the encryption key contains spaces', () => {
      beforeEach(() => {
        const validHex = randomBytes(32).toString('hex')
        configRequireString.mockResolvedValue(validHex.slice(0, 32) + ' ' + validHex.slice(33))
      })

      it('should throw an error indicating invalid characters', async () => {
        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY: contains non-hexadecimal characters')
      })
    })

    describe('and the encryption key is empty', () => {
      beforeEach(() => {
        configRequireString.mockResolvedValue('')
      })

      it('should throw an error indicating invalid characters', async () => {
        await expect(createComponent()).rejects.toThrow('Invalid ENCRYPTION_KEY: contains non-hexadecimal characters')
      })
    })
  })

  describe('when encrypting', () => {
    describe('and the encrypted text is a plaintext string', () => {
      let plaintext: string
      let encrypted: Buffer

      beforeEach(() => {
        plaintext = 'my-secret-value'
        encrypted = component.encrypt(plaintext)
      })

      it('should return a buffer larger than the minimum due to ciphertext', () => {
        expect(encrypted.length).toBeGreaterThan(MIN_ENCRYPTED_LENGTH)
      })

      it('should include the format version as the first byte', () => {
        expect(encrypted[0]).toBe(0x01)
      })
    })

    describe('and the encrypted text is an empty string', () => {
      let encrypted: Buffer

      beforeEach(() => {
        encrypted = component.encrypt('')
      })

      it('should return a buffer with exactly the minimum length', () => {
        expect(encrypted.length).toBe(MIN_ENCRYPTED_LENGTH)
      })
    })

    describe('and the encrypted text is the same plaintext twice', () => {
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

    describe('and the encrypted text includes unicode characters', () => {
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

  describe('when decrypting', () => {
    describe('and the encrypted buffer is valid', () => {
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

    describe('and the encrypted buffer is an empty string', () => {
      let decrypted: string

      beforeEach(() => {
        const encrypted = component.encrypt('')
        decrypted = component.decrypt(encrypted)
      })

      it('should return an empty string', () => {
        expect(decrypted).toBe('')
      })
    })

    describe('and the encrypted buffer includes unicode characters', () => {
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

    describe('and the encrypted buffer is too short', () => {
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

    describe("and the encrypted buffer's ciphertext has been tampered with", () => {
      let tamperedBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('original-secret')
        tamperedBuffer = Buffer.from(encrypted)
        // Tamper with the ciphertext (after version + IV)
        const ciphertextStart = VERSION_LENGTH + IV_LENGTH
        tamperedBuffer[ciphertextStart] = tamperedBuffer[ciphertextStart] ^ 0xff
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(tamperedBuffer)).toThrow(DecryptionError)
      })
    })

    describe("and the encrypted buffer's auth tag has been tampered with", () => {
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

    describe("and the encrypted buffer's IV has been tampered with", () => {
      let tamperedBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('original-secret')
        tamperedBuffer = Buffer.from(encrypted)
        // Tamper with the IV (starts at byte 1, after version)
        tamperedBuffer[VERSION_LENGTH] = tamperedBuffer[VERSION_LENGTH] ^ 0xff
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(tamperedBuffer)).toThrow(DecryptionError)
      })
    })

    describe('and the encryption key is different', () => {
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

    describe('and the encrypted buffer has an unsupported version', () => {
      let unsupportedVersionBuffer: Buffer

      beforeEach(() => {
        const encrypted = component.encrypt('secret-data')
        unsupportedVersionBuffer = Buffer.from(encrypted)
        // Change version byte to an unsupported version
        unsupportedVersionBuffer[0] = 0x99
      })

      it('should throw a DecryptionError', () => {
        expect(() => component.decrypt(unsupportedVersionBuffer)).toThrow(DecryptionError)
      })

      it('should include the unsupported version in the error message', () => {
        expect(() => component.decrypt(unsupportedVersionBuffer)).toThrow('Unsupported encryption format version: 153')
      })
    })
  })
})
