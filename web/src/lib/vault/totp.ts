/**
 * TOTP codes, generated here and nowhere else.
 *
 * A TOTP code comes from two things and nothing more: a seed shared once when the
 * second factor is set up, and the clock. There is no server to ask, which is what
 * puts it within reach of a zero-knowledge vault without touching anything: it fits
 * entirely in the client, needs no endpoint, and the seed is short text that already
 * knows how to travel inside the encrypted blob. See ADR-017.
 *
 * IT LIVES BESIDE THE REST OF THE CRYPTOGRAPHY on purpose, and it brings no new
 * dependency: HMAC is in `crypto.subtle`, and that it needs nothing installed is part
 * of why storing seeds was approved at all — this is the client that serves the
 * JavaScript encrypting the passwords, and ADR-001 is clear that the model protects
 * the database and not the integrity of that JavaScript.
 *
 * THE FAILURE MODE HERE IS UNLIKE ANY OTHER IN THIS CODEBASE, and it shapes every
 * decision below: a TOTP done wrong does not raise an error, it returns SIX PLAUSIBLE
 * DIGITS that no service accepts. There is no way to look at a code and see that it is
 * wrong. That is why the tests are the RFC 6238 vectors and why nothing here guesses.
 */

/** The parameters an `otpauth://` URI may leave out, as RFC 6238 defines them. */
export const DEFAULT_DIGITS = 6
export const DEFAULT_PERIOD = 30
export const DEFAULT_ALGORITHM = 'SHA1'

/**
 * The hashes a code can be built on.
 *
 * SHA-1 is the one real services emit, and it is not a security decision made here:
 * HMAC-SHA1 is not weakened by the collision attacks that retired SHA-1 for
 * signatures. The other two exist because a URI may declare them, and reading
 * `algorithm=SHA256` and hashing with SHA-1 anyway is exactly the silent wrongness
 * this module refuses to produce.
 */
export const ALGORITHMS = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
} as const

export type TotpAlgorithm = keyof typeof ALGORITHMS

/** How many digits a code may have. Fewer than six is not a second factor. */
export const MIN_DIGITS = 6
export const MAX_DIGITS = 10

/** What is needed to produce a code, with nothing left to assume. */
export interface TotpParameters {
  /** The decoded seed. It never leaves this object as text. */
  secret: Uint8Array
  digits: number
  /** The window in seconds. Thirty everywhere in practice. */
  period: number
  algorithm: TotpAlgorithm
  /** Who issued it, when the URI says so. Shown, never used to compute. */
  issuer?: string
  /** The account it belongs to, when the URI says so. */
  account?: string
}

/** A seed or a URI that cannot be read. It is thrown on saving, never on using. */
export class InvalidTotpSeed extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTotpSeed'
  }
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Decodes a base32 seed, RFC 4648, as forgiving as reading one aloud requires.
 *
 * Spaces are stripped and lowercase is accepted because that is how seeds reach a
 * person: in groups of four, on a web page, next to a QR code. Padding is optional
 * for the same reason — some services print it and others do not, and rejecting a
 * seed over its trailing equals signs would be refusing correct input.
 *
 * WHAT IT DOES NOT FORGIVE IS A CHARACTER OUTSIDE THE ALPHABET, and that is the whole
 * point of it throwing. Base32 has no 0, 1 or 8; somebody transcribing by hand writes
 * O for zero and l for one. Skipping them quietly would build a seed a few bits away
 * from the right one, which produces six plausible digits forever.
 */
export function decodeBase32(text: string): Uint8Array {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()

  if (!clean) throw new InvalidTotpSeed('La clave está vacía')

  const bytes: number[] = []
  let buffer = 0
  let bits = 0

  for (const character of clean) {
    const value = BASE32.indexOf(character)

    if (value < 0) {
      throw new InvalidTotpSeed(`«${character}» no es un carácter válido en una clave`)
    }

    buffer = (buffer << 5) | value
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  /*
   * The leftover bits have to be zero padding. Anything else means the text is not a
   * whole base32 string, and a seed missing its last character is the transcription
   * mistake this decoder exists to catch.
   */
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new InvalidTotpSeed('La clave está incompleta')
  }

  if (bytes.length === 0) throw new InvalidTotpSeed('La clave es demasiado corta')

  return new Uint8Array(bytes)
}

/**
 * Reads what the user pasted: an `otpauth://` URI, or a bare base32 seed.
 *
 * NOTHING IS GUESSED HERE, which is ADR-017 §4 turned into code: a parameter the URI
 * declares and this module cannot honour is a reason to refuse the seed, not to fall
 * back to a default. The RFC's defaults apply only where the URI is SILENT, which is a
 * different thing and the distinction is the whole of this function.
 */
export function parseTotp(input: string): TotpParameters {
  const text = input.trim()

  if (!text) throw new InvalidTotpSeed('No hay ninguna clave')
  if (!/^otpauth:\/\//i.test(text)) {
    return {
      secret: decodeBase32(text),
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
      algorithm: DEFAULT_ALGORITHM,
    }
  }

  let url: URL

  try {
    url = new URL(text)
  } catch {
    throw new InvalidTotpSeed('La dirección otpauth:// no se entiende')
  }

  if (url.host.toLowerCase() !== 'totp') {
    throw new InvalidTotpSeed('Solo se admiten códigos de tipo TOTP')
  }

  const parameters = url.searchParams
  const secret = parameters.get('secret')

  if (!secret) throw new InvalidTotpSeed('La dirección no lleva ninguna clave')

  const algorithm = readAlgorithm(parameters.get('algorithm'))
  const digits = readNumber(parameters.get('digits'), DEFAULT_DIGITS, 'digits')
  const period = readNumber(parameters.get('period'), DEFAULT_PERIOD, 'period')

  if (digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new InvalidTotpSeed(`Un código de ${digits} dígitos no se admite`)
  }

  if (period <= 0) throw new InvalidTotpSeed('El intervalo tiene que ser mayor que cero')

  /*
   * The label is «Issuer:account», and the issuer may also come as a parameter. The
   * parameter wins when both are there, which is what the Key URI Format says: the
   * label is the older form and services that fill both make the parameter the
   * authoritative one.
   */
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const separator = label.indexOf(':')
  const fromLabel = separator >= 0 ? label.slice(0, separator).trim() : ''
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim()

  return {
    secret: decodeBase32(secret),
    digits,
    period,
    algorithm,
    issuer: parameters.get('issuer')?.trim() || fromLabel || undefined,
    account: account || undefined,
  }
}

/** The declared hash, or the RFC's default when nothing is declared. Never a guess. */
function readAlgorithm(declared: string | null): TotpAlgorithm {
  if (declared === null) return DEFAULT_ALGORITHM

  const name = declared.trim().toUpperCase().replace('-', '')

  if (name in ALGORITHMS) return name as TotpAlgorithm

  throw new InvalidTotpSeed(`El algoritmo ${declared} no se admite`)
}

/** A declared whole number, or the default when nothing is declared. */
function readNumber(declared: string | null, fallback: number, name: string): number {
  if (declared === null) return fallback

  const value = Number(declared.trim())

  if (!Number.isInteger(value)) throw new InvalidTotpSeed(`El valor de ${name} no es un número`)

  return value
}

/**
 * The code for a moment in time.
 *
 * The time comes in as an argument and is not read from the clock inside, because a
 * function that reads the clock cannot be tested against the RFC's vectors — which are
 * a table of instants and their codes, and are the only thing that proves this right.
 */
export async function totpCode(parameters: TotpParameters, atMs: number): Promise<string> {
  const counter = Math.floor(atMs / 1000 / parameters.period)
  const message = new ArrayBuffer(8)

  new DataView(message).setBigUint64(0, BigInt(counter))

  const key = await crypto.subtle.importKey(
    'raw',
    parameters.secret as BufferSource,
    { name: 'HMAC', hash: ALGORITHMS[parameters.algorithm] },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))

  /*
   * Dynamic truncation, RFC 4226 §5.3: the last four bits say where to read from, the
   * top bit of the four bytes read is dropped so the result does not depend on how the
   * platform treats a sign, and the remainder gives the digits.
   */
  const offset = mac[mac.length - 1] & 0x0f
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3]

  return String(binary % 10 ** parameters.digits).padStart(parameters.digits, '0')
}

/**
 * The seconds left on the current code.
 *
 * It is what the screen counts down, and it is deliberately a plain calculation over
 * the time it is given: the countdown that shows it must not become a heartbeat that
 * keeps the vault unlocked, and ADR-017 §2.4 makes that the one thing the
 * implementation has to get right.
 */
export function secondsRemaining(parameters: TotpParameters, atMs: number): number {
  const seconds = Math.floor(atMs / 1000)

  return parameters.period - (seconds % parameters.period)
}
