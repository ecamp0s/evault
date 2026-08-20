/**
 * THIS IS WHERE THINGS ARE ENCRYPTED.
 *
 * The client's cryptographic primitive, and the only place in the project where a key
 * is derived or `crypto.subtle` is called. It knows nothing about React, the API or
 * the shape of the endpoints: it takes text and keys, and returns text and keys.
 *
 * What it implements is decided and argued in ADR-008. In one line: PBKDF2 derives a
 * master key from the master password, and that key encrypts NO item — it wraps a
 * random vault key, and it is that one that encrypts the content.
 *
 * The warning that governs any change to this file, from ADR-001: the cost of a bug
 * here is irreversible data loss, not a recoverable error. Nobody can recover what
 * only the user could decrypt, not even whoever runs the service. Every property that
 * guarantee rests on has its test in cripto.test.ts, and those tests are not
 * documentation: they are the net.
 */

/**
 * PBKDF2-HMAC-SHA256 iterations.
 *
 * 600.000 is OWASP's explicit recommendation for this combination, not a tolerated
 * minimum. That derivation takes a noticeable moment is the wanted effect and not a
 * performance problem to optimise away: it is what it costs whoever tries passwords
 * blindly.
 *
 * Raising this number is not a local change. The parameters live in the client and
 * not on the server, so changing it here locks out every user already registered. See
 * consequence 1 of ADR-008.
 */
export const ITERATIONS = 600_000

/** Size of the keys and of the derived material. AES-256 and SHA-256. */
export const KEY_BITS = 256

/**
 * 96 bits, which is the nonce size recommended for AES-GCM.
 *
 * With a random IV of this size, the risk of repeating one under the same key starts
 * to matter around 2^32 writes. A real vault comes nowhere near, but the number is
 * better written down than discovered.
 */
export const IV_BYTES = 12

/** Version of the cryptographic schema. Version 1 was the unencrypted encoding. */
export const CIPHER_VERSION = 2

/**
 * Something encrypted, ready to travel: the bytes and the nonce they were made with.
 *
 * The names are neutral on purpose. It serves both an item's content, which the API
 * calls `ciphertext`, and the wrapped vault key, which is another field. Translating
 * to the names of the contract is the caller's job.
 *
 * There is no field for GCM's authentication tag: `crypto.subtle` appends it to the
 * end of the data. Giving it a field of its own would be a mistake, and FOUNDATION.md
 * warns about it too.
 */
export interface Encrypted {
  /** The encrypted bytes, in base64. */
  data: string
  /** The nonce, in base64. */
  iv: string
}

/** What comes out of the master password: a key that stays and a hash that travels. */
export interface DerivedKeys {
  /**
   * Wraps and unwraps the vault key. It encrypts no item and never leaves the device.
   * It is not extractable, so its material cannot be read back out.
   */
  masterKey: CryptoKey
  /**
   * The only thing that travels to the server, in the `password` field that already
   * exists. The master key cannot be obtained from it: whoever captures it gets a
   * session, not the content. See ADR-008.
   */
  authHash: string
}

/**
 * A decryption failure, told apart from any other error.
 *
 * It exists because the right answer to this is never to carry on with a filler
 * value. A decryption that fails means one of three things: the master password is
 * not the one that encrypted this, the data arrived corrupted, or somebody tampered
 * with it on the way. All three call for stopping and saying so.
 */
export class DecryptionError extends Error {
  constructor(message = 'No se ha podido descifrar') {
    super(message)
    this.name = 'ErrorDeDescifrado'
  }
}

/**
 * Bytes with an ArrayBuffer of their own behind them.
 *
 * Since TypeScript 5.7 `Uint8Array` is generic over its buffer, and with no argument
 * it means `Uint8Array<ArrayBufferLike>`, which includes `SharedArrayBuffer`. The
 * signatures of `crypto.subtle` ask for `BufferSource`, which does not include it, so
 * a bare `Uint8Array` cannot be passed to them.
 *
 * The alias exists to settle that at the boundary — where the bytes are made — rather
 * than scattering type assertions across every call into the crypto API. An `as` here
 * would be a particularly bad idea: silencing the compiler in the module where one
 * misplaced byte is data loss is exactly where it does not pay.
 */
type Bytes = Uint8Array<ArrayBuffer>

/*
 * Conversions. btoa and atob only handle latin1, so this file always works with
 * explicit bytes and never hands them a string of text directly. The lesson comes
 * from Iteration 2, where the first entry named with a character outside ASCII
 * would have broken saving.
 */

function toBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function fromBase64(base64: string): Bytes {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let position = 0; position < binary.length; position += 1) {
    bytes[position] = binary.charCodeAt(position)
  }

  return bytes
}

function toBytes(text: string): Bytes {
  return new TextEncoder().encode(text)
}

function toText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/**
 * Normalises the email so it can be used as the salt of the derivation.
 *
 * Part of the cryptographic contract and not a courtesy of the interface: the email
 * IS the salt, so client and server have to normalise it exactly alike or the
 * derivation does not match. The server applies `mb_strtolower(trim(...))` in
 * RegisterUser and LoginUser, and this is its counterpart.
 *
 * The failure it prevents is one of the invisible ones: somebody signs up as
 * `Ada@Example.com`, signs in typing `ada@example.com`, gets a different
 * authentication hash and is told «wrong credentials». Everyone then looks at the
 * login, which is the one place the problem is not.
 *
 * toLowerCase and not toLocaleLowerCase, deliberately: the locale-aware variant turns
 * a capital I into a dotless ı under Turkish settings, and then the same email would
 * derive differently depending on the language of the device.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function importForDerivation(material: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
}

async function deriveBits(
  material: Bytes,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> {
  const key = await importForDerivation(material)

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )

  return new Uint8Array(bits)
}

async function importForEncryption(material: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/**
 * Derives from the master password the only two things that come out of it: the
 * master key, which stays, and the authentication hash, which travels.
 *
 * Both outputs are produced in a single call because the expensive part — the 600.000
 * iterations — is shared, and because separating them would invite asking for the
 * hash on its own without realising what it costs.
 *
 * The hash is derived from the master key using the password as salt. Reversing that
 * takes reversing HMAC-SHA256, and that is why the server, which knows the hash, does
 * not reach the key.
 */
export async function deriveKeys(
  masterPassword: string,
  email: string,
): Promise<DerivedKeys> {
  const masterBits = await deriveBits(
    toBytes(masterPassword),
    toBytes(normalizeEmail(email)),
    ITERATIONS,
  )

  /*
   * A single iteration, and it is not an oversight. The hard work is already done:
   * what goes in here is the master key, which already cost 600.000 iterations, and
   * not the password. Repeating them would only double the wait.
   */
  const hashBits = await deriveBits(masterBits, toBytes(masterPassword), 1)

  return {
    masterKey: await importForEncryption(masterBits),
    authHash: toBase64(hashBits),
  }
}

async function encryptBytes(key: CryptoKey, data: Bytes): Promise<Encrypted> {
  /*
   * A fresh IV on every call, without exception. Reusing a nonce with GCM does not
   * weaken the security, it breaks it: two messages sharing a key and nonce reveal
   * their XOR and compromise the authentication key. It is the classic failure of
   * this primitive, and that is why the IV is made in here, where nobody can pass
   * one in.
   */
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const encryptedBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)

  return { data: toBase64(new Uint8Array(encryptedBytes)), iv: toBase64(iv) }
}

async function decryptBytes(key: CryptoKey, encrypted: Encrypted): Promise<Bytes> {
  try {
    const plainBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(encrypted.iv) },
      key,
      fromBase64(encrypted.data),
    )

    return new Uint8Array(plainBytes)
  } catch {
    /*
     * It swallows the original error on purpose. What arrives here is both an
     * OperationError from a GCM tag that does not validate — wrong password or
     * tampered data — and a base64 that cannot be decoded. Telling them apart on the
     * way out would not help the caller, and would tell an attacker which of their
     * two hypotheses was the right one.
     */
    throw new DecryptionError()
  }
}

/**
 * Creates the key that encrypts a vault's content, and its wrapper.
 *
 * The key is generated here, wrapped here and imported here, so its plaintext
 * material never leaves the module for a moment. The caller gets a key it can use but
 * not read, and a blob it can store but not open.
 */
export async function createVaultKey(
  masterKey: CryptoKey,
): Promise<{ vaultKey: CryptoKey; wrapped: Encrypted }> {
  const material = crypto.getRandomValues(new Uint8Array(KEY_BITS / 8))

  return {
    vaultKey: await importForEncryption(material),
    wrapped: await encryptBytes(masterKey, material),
  }
}

/**
 * Opens the wrapper and returns the vault key, ready to use.
 *
 * Fails with ErrorDeDescifrado when the master key is not the one that wrapped this,
 * which in practice means the master password is wrong. It is the point where
 * unlocking the vault is accepted or refused.
 */
export async function openVaultKey(
  masterKey: CryptoKey,
  wrapped: Encrypted,
): Promise<CryptoKey> {
  return importForEncryption(await decryptBytes(masterKey, wrapped))
}

/** Encrypts an item's content with the vault key. */
export async function encrypt(vaultKey: CryptoKey, text: string): Promise<Encrypted> {
  return encryptBytes(vaultKey, toBytes(text))
}

/** Decrypts an item's content. Throws ErrorDeDescifrado when it cannot. */
export async function decrypt(vaultKey: CryptoKey, encrypted: Encrypted): Promise<string> {
  return toText(await decryptBytes(vaultKey, encrypted))
}

/*
 * ---------------------------------------------------------------------------
 * Recovery key. See ADR-010.
 * ---------------------------------------------------------------------------
 */

/**
 * HKDF domain labels.
 *
 * They are what makes one secret yield two independent values: one wraps the vault
 * key and the other travels to the server. Without separating them, what is sent
 * would compromise what opens.
 *
 * They carry a version in the name on purpose. If the derivation ever changes, the
 * new label produces different keys and the old wrappers silently stop opening;
 * seeing it written here forces thinking about the migration before touching it.
 */
const RECOVERY_WRAP_INFO = 'evault-recovery-wrap-v1'
const RECOVERY_AUTH_INFO = 'evault-recovery-auth-v1'

/**
 * What comes out of the recovery key: a key that wraps and a hash that travels. The
 * split is the same one the master password gets in ADR-008.
 */
export interface RecoveryKeys {
  /** Wraps the vault key. Never leaves the device. */
  wrapKey: CryptoKey
  /** The only thing that travels to the server. wrapKey cannot be reached from it. */
  authHash: string
}

/**
 * Derives the recovery key's two values, with HKDF.
 *
 * HKDF and not PBKDF2, deliberately: what goes in here is not a human password but
 * 256 bits from crypto.getRandomValues. There is no dictionary to try, so the 600.000
 * iterations of the master password would buy nothing beyond waiting. A KDF's cost
 * exists to make up for missing entropy, and none is missing here. Argued in ADR-010
 * §2.2.
 *
 * The salt is the normalised email, as in ADR-008 and for the same reason: the
 * derivation has to be reproducible without asking the server anything.
 */
export async function deriveRecoveryKeys(
  recoveryKey: Bytes,
  email: string,
): Promise<RecoveryKeys> {
  const base = await crypto.subtle.importKey('raw', recoveryKey, 'HKDF', false, ['deriveBits'])
  const salt = toBytes(normalizeEmail(email))

  const expand = async (info: string): Promise<Bytes> => {
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: toBytes(info) },
      base,
      KEY_BITS,
    )

    return new Uint8Array(bits)
  }

  return {
    wrapKey: await importForEncryption(await expand(RECOVERY_WRAP_INFO)),
    authHash: toBase64(await expand(RECOVERY_AUTH_INFO)),
  }
}

/**
 * Wraps the vault key a second time, now with the recovery key.
 *
 * It takes the ordinary wrapper and the master key instead of the vault key, and that
 * is not a detour: the vault key is imported as NOT extractable, so its material
 * cannot be read back from outside this module. In here it can, by opening the
 * wrapper that already exists, and so the guarantee that the material never leaves
 * stays intact.
 *
 * Throws DecryptionError when the master key is not the one that wrapped this, which
 * is how it is known that the master password typed in was not the right one.
 */
export async function wrapVaultKeyForRecovery(
  masterKey: CryptoKey,
  wrapped: Encrypted,
  recoveryWrapKey: CryptoKey,
): Promise<Encrypted> {
  return encryptBytes(recoveryWrapKey, await decryptBytes(masterKey, wrapped))
}

/**
 * Changes which key the vault key is wrapped with.
 *
 * It opens the wrapper with one key and closes it again with another, without the
 * plaintext material leaving this module. It serves the two places that need it, and
 * that is why the parameters are named after neither: recovery opens with the
 * recovery key and closes with the new master key, and changing the password opens
 * with the old master key and closes with the new one.
 *
 * Throws DecryptionError when the key it opens with is not the one that wrapped this,
 * which is how it is known that the password typed in was not the right one.
 */
export async function rewrap(
  from: CryptoKey,
  wrapped: Encrypted,
  to: CryptoKey,
): Promise<Encrypted> {
  return encryptBytes(to, await decryptBytes(from, wrapped))
}

/*
 * ---------------------------------------------------------------------------
 * Export. See ADR-011.
 * ---------------------------------------------------------------------------
 */

/**
 * Iterations an export file is encrypted with.
 *
 * Never fewer than the vault's, for a reason ADR-011 underlines: an encrypted file is
 * a target for OFFLINE brute force. Whoever holds it can attack it without a limit on
 * attempts and without anyone finding out, which is a worse position than the
 * server's.
 *
 * This number is NOT pinned in the client the way the vault's is: it travels inside
 * the file, so raising it leaves no earlier export unreadable. It is precisely the
 * price ADR-008 had to accept and that there is no reason to pay here.
 */
export const EXPORT_ITERATIONS = 600_000

/** Salt bytes for an export. Random per file, not the email. */
export const EXPORT_SALT_BYTES = 16

/**
 * Derives the key an export file is encrypted with.
 *
 * The salt arrives as a parameter instead of being made here because importing has to
 * reproduce the derivation with whichever one came in the file. Whoever exports
 * generates it at random; whoever imports reads it.
 */
export async function deriveExportKey(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  return importForEncryption(await deriveBits(toBytes(passphrase), salt, iterations))
}

/** Random bytes, for the salt of an export. */
export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** Base64 of some bytes, for whatever has to travel inside a text file. */
export function bytesToBase64(bytes: Bytes): string {
  return toBase64(bytes)
}

/** The bytes of a base64, for reading back what came in a file. */
export function base64ToBytes(value: string): Bytes {
  return fromBase64(value)
}
