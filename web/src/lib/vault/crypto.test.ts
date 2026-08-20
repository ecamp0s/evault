import { beforeAll, describe, expect, it } from 'vitest'
import {
  IV_BYTES,
  type Encrypted,
  type DerivedKeys,
  DecryptionError,
  ITERATIONS,
  CIPHER_VERSION,
  openVaultKey,
  encrypt,
  createVaultKey,
  deriveKeys,
  decrypt,
  normalizeEmail,
} from './crypto'

/*
 * These tests are the net ADR-001 talks about: the cost of a bug in crypto.ts is
 * irreversible data loss, not a recoverable error. Every block below watches one
 * specific property that guarantee rests on, and if any of them starts failing the
 * question is not how to make it pass, but which guarantee has broken.
 *
 * On slowness: deriving costs 600.000 iterations on purpose, so every derivation is
 * done once in beforeAll and shared out among the tests. If this file turns slow, the
 * way out is reusing more, never lowering ITERACIONES.
 */

const EMAIL = 'ada@example.com'
const MASTER = 'una contraseña maestra razonablemente larga'
const OTHER_MASTER = 'otra contraseña maestra completamente distinta'

let queryKeys: DerivedKeys
let sameKeys: DerivedKeys
let keysWithOtherMaster: DerivedKeys
let keysWithDirtyEmail: DerivedKeys
let keysWithOtherEmail: DerivedKeys
let vaultKey: CryptoKey
let wrapped: Encrypted

beforeAll(async () => {
  ;[queryKeys, sameKeys, keysWithOtherMaster, keysWithDirtyEmail, keysWithOtherEmail] =
    await Promise.all([
      deriveKeys(MASTER, EMAIL),
      deriveKeys(MASTER, EMAIL),
      deriveKeys(OTHER_MASTER, EMAIL),
      deriveKeys(MASTER, '  Ada@Example.COM  '),
      deriveKeys(MASTER, 'grace@example.com'),
    ])

  const vault = await createVaultKey(queryKeys.masterKey)

  vaultKey = vault.vaultKey
  wrapped = vault.wrapped
}, 60_000)

/** Changes one character of the base64, which is what an attacker or a bad disk would do. */
function tamper(encrypted: Encrypted, field: keyof Encrypted = 'data'): Encrypted {
  const original = encrypted[field]
  const position = 2

  return {
    ...encrypted,
    [field]:
      original.slice(0, position) +
      (original[position] === 'A' ? 'B' : 'A') +
      original.slice(position + 1),
  }
}

/** Imports arbitrary bytes as an AES key, to prove they do NOT open something. */
async function asKey(base64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))

  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

describe('parameters of the schema', () => {
  /*
   * Not a test that 600.000 is the right number — that is human judgement and lives in
   * ADR-008. It is a test that nobody lowers it without meaning to, for instance to
   * make the suite run faster, which is the obvious temptation.
   */
  it('the iterations are the ones ADR-008 fixes', () => {
    expect(ITERATIONS).toBe(600_000)
  })

  it('the nonce is 96 bits, the size recommended for AES-GCM', () => {
    expect(IV_BYTES).toBe(12)
  })

  it('the schema version tells encryption apart from the earlier encoding', () => {
    expect(CIPHER_VERSION).toBe(2)
  })
})

describe('normalising the email', () => {
  it('strips spaces and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM  ')).toBe('ada@example.com')
  })

  /*
   * The server normalises with mb_strtolower(trim(...)) and the client derives before
   * sending anything, so both normalisations have to agree or the user does not get
   * in. This checks it end to end: the same email written two ways has to produce the
   * same authentication hash.
   */
  it('the same email written differently derives exactly the same', () => {
    expect(keysWithDirtyEmail.authHash).toBe(queryKeys.authHash)
  })

  it('a different email derives something different, because it is the salt', () => {
    expect(keysWithOtherEmail.authHash).not.toBe(queryKeys.authHash)
  })
})

describe('deriving keys', () => {
  it('the same password and the same email always derive the same', () => {
    expect(sameKeys.authHash).toBe(queryKeys.authHash)
  })

  it('two different passwords derive different hashes', () => {
    expect(keysWithOtherMaster.authHash).not.toBe(queryKeys.authHash)
  })

  it('the authentication hash is 256 bits in base64', () => {
    expect(atob(queryKeys.authHash)).toHaveLength(32)
  })

  /*
   * ADR-007 forbids persisting the key even as a non-extractable CryptoKey, but not
   * being extractable still matters: it stops an XSS from reading the material and
   * taking it away to decrypt later, outside the tab.
   */
  it('the master key is not extractable', async () => {
    expect(queryKeys.masterKey.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', queryKeys.masterKey)).rejects.toThrow()
  })

  /*
   * The property ADR-001 demands in writing and ADR-008 argues: the server knows the
   * authentication hash and with it can open nothing. It is checked by using it as if
   * it were the master key, which is exactly what whoever captured it would try.
   */
  it('the hash that travels to the server does not open the vault', async () => {
    await expect(
      openVaultKey(await asKey(queryKeys.authHash), wrapped),
    ).rejects.toBeInstanceOf(DecryptionError)
  })
})

describe('the vault key and its wrapper', () => {
  it('the right master key opens the wrapper', async () => {
    const opened = await openVaultKey(queryKeys.masterKey, wrapped)
    const encrypted = await encrypt(vaultKey, 'lo de siempre')

    expect(await decrypt(opened, encrypted)).toBe('lo de siempre')
  })

  /*
   * The case of the login that works and the unlock that does not: right credentials
   * against a wrapper that password never wrapped. It has to be distinguishable,
   * because the interface says different things in each case.
   */
  it('a different master password does not open the wrapper', async () => {
    await expect(
      openVaultKey(keysWithOtherMaster.masterKey, wrapped),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  it('the vault key is not extractable', async () => {
    expect(vaultKey.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', vaultKey)).rejects.toThrow()
  })

  /*
   * Two vaults created under the same master key have different keys. Were this to
   * fail, the vault key would be being derived instead of generated at random, and
   * exactly what ADR-008 buys with it would have been lost.
   */
  it('every vault gets a key of its own', async () => {
    const other = await createVaultKey(queryKeys.masterKey)
    const encryptedWithFirst = await encrypt(vaultKey, 'secreto')

    expect(other.wrapped.data).not.toBe(wrapped.data)
    await expect(decrypt(other.vaultKey, encryptedWithFirst)).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })
})

describe('encrypting and decrypting the content', () => {
  it('the full round trip returns the same text', async () => {
    const text = JSON.stringify({ nombre: 'GitHub', password: 'secreto' })

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })

  /*
   * The direct inheritance of Iteration 2's btoa lesson: the first entry named with a
   * character outside ASCII would have broken saving. Here it goes through explicit
   * UTF-8 both ways, and this is what pins it down.
   */
  it('survives accents, emoji and non-Latin alphabets', async () => {
    const text = 'Correo del año 漢字 · añoñó@example.com · çontraseña-🔐-ñ · Ω≈ç√∫˜µ'

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })

  it('survives an empty text', async () => {
    expect(await decrypt(vaultKey, await encrypt(vaultKey, ''))).toBe('')
  })

  it('survives a long text', async () => {
    const text = 'ñ🔐'.repeat(20_000)

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })
})

describe('the nonce is never reused', () => {
  /*
   * The classic failure of AES-GCM, and the gravest that can be made with this
   * primitive: two messages encrypted under the same key and nonce reveal their XOR
   * and compromise the authentication key. It does not weaken the security, it breaks
   * it.
   */
  it('encrypting the same thing twice produces two different nonces', async () => {
    const firstOne = await encrypt(vaultKey, 'el mismo texto exacto')
    const secondOne = await encrypt(vaultKey, 'el mismo texto exacto')

    expect(firstOne.iv).not.toBe(secondOne.iv)
  })

  it('encrypting the same thing twice produces two different ciphertexts', async () => {
    const firstOne = await encrypt(vaultKey, 'el mismo texto exacto')
    const secondOne = await encrypt(vaultKey, 'el mismo texto exacto')

    expect(firstOne.data).not.toBe(secondOne.data)
  })

  /*
   * Over a sample, not over two: a broken generator returning the same value always
   * could slip through a couple of comparisons if it carried any state, and there is
   * no room here for «different almost every time».
   */
  it('a hundred encryptions produce a hundred different nonces', async () => {
    const encryptedBytes = await Promise.all(
      Array.from({ length: 100 }, () => encrypt(vaultKey, 'igual')),
    )

    expect(new Set(encryptedBytes.map(({ iv }) => iv)).size).toBe(100)
  })

  it('the nonce takes up the 96 bits it declares', async () => {
    const { iv } = await encrypt(vaultKey, 'lo que sea')

    expect(atob(iv)).toHaveLength(IV_BYTES)
  })
})

describe('faced with data it cannot decrypt', () => {
  /*
   * What GCM's authentication tag protects. Without it, altering the ciphertext would
   * produce a decryption with rubbish inside instead of an error, and that rubbish
   * would end up stored over the good data.
   */
  it('a tampered ciphertext fails instead of returning rubbish', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(decrypt(vaultKey, tamper(encrypted))).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('a tampered nonce fails', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(decrypt(vaultKey, tamper(encrypted, 'iv'))).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('a truncated ciphertext fails', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(
      decrypt(vaultKey, { ...encrypted, data: encrypted.data.slice(0, 8) }),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  /*
   * An invalid base64 never reaches the primitive: it blows up earlier, while
   * decoding. It comes out as ErrorDeDescifrado all the same so the caller has a
   * single error to handle, and not a DOMException sneaking in by another route.
   */
  it('something that is not even base64 fails as a decryption error', async () => {
    await expect(
      decrypt(vaultKey, { data: '!!! no es base64 !!!', iv: 'tampoco' }),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  /*
   * The message does not distinguish between a wrong password, corrupt data and
   * tampered data. Deliberate: the caller cannot do anything different in each case,
   * and saying it would confirm to an attacker which of their hypotheses was right.
   */
  it('the error does not reveal which of the possible causes it was', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    const fromTampering = await decrypt(vaultKey, tamper(encrypted)).catch(
      (error: unknown) => error,
    )
    const fromBadKey = await openVaultKey(
      keysWithOtherMaster.masterKey,
      wrapped,
    ).catch((error: unknown) => error)

    expect((fromTampering as Error).message).toBe((fromBadKey as Error).message)
  })
})
