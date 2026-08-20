/**
 * The format a person keeps their recovery key in.
 *
 * The cryptography is in crypto.ts; this is only the translation between 256 bits and
 * something that can be copied onto paper without slipping. It sounds minor and is
 * not: a mistranscribed key is not discovered on the day it is stored but on the day
 * it is needed, and on that day there is no other way in. See ADR-010 §2.4.
 */

/**
 * Base32 without ambiguous characters.
 *
 * I, L, O and U are missing. The first three because they get confused with one and
 * zero when read in handwriting, which is exactly what is going to happen to this. U
 * is dropped as well so that no combination spells anything rude, which is why
 * Crockford took it out of his alphabet and this is the same one.
 *
 * It is the decision the password generator made in #85 when it dropped the ambiguous
 * characters, applied to something that really will be copied by hand.
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Bits each character of the alphabet encodes. */
const BITS_PER_CHAR = 5

/** Size of the block it is grouped into, so it can be read at a glance. */
const GROUP_SIZE = 4

/** 256 bits in base32 are 52 characters, plus one for the check. */
export const RECOVERY_KEY_LENGTH = 52

/**
 * A freshly generated recovery secret.
 *
 * The bytes are for deriving; the text is what the user sees and keeps. They are
 * returned together so that nobody has to decode again what they have just generated,
 * which would be one more round trip to get wrong.
 */
export interface GeneratedRecoveryKey {
  bytes: Uint8Array<ArrayBuffer>
  /** With the groups separated by dashes, exactly as it has to be shown. */
  formatted: string
}

/**
 * The check character: the sum of every byte, in the alphabet.
 *
 * It protects against nothing malicious and does not pretend to. What it does is tell
 * «this is written down wrong» apart from «this does not open your vault», which are
 * two very different messages: the first invites another look at the paper and the
 * second invites giving up. Iteration 3 already learned that distinction with «wrong
 * credentials» against «the vault cannot be opened».
 */
function checksumChar(bytes: Uint8Array): string {
  let sum = 0

  for (const byte of bytes) {
    sum = (sum + byte) % RECOVERY_ALPHABET.length
  }

  return RECOVERY_ALPHABET[sum]
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= BITS_PER_CHAR) {
      output += RECOVERY_ALPHABET[(value >>> (bits - BITS_PER_CHAR)) & 31]
      bits -= BITS_PER_CHAR
    }
  }

  // Leftover bits are padded on the right: 256 is not a multiple of 5.
  if (bits > 0) {
    output += RECOVERY_ALPHABET[(value << (BITS_PER_CHAR - bits)) & 31]
  }

  return output
}

/** Groups it in fours with dashes. */
export function groupRecoveryKey(key: string): string {
  return (key.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? []).join('-')
}

/**
 * Generates a new recovery key.
 *
 * The 256 bits come from crypto.getRandomValues and from nowhere else. There is no KDF
 * behind this to make up for weak generation, so if this stopped being genuinely
 * random, recovery would become the attackable link of the whole product. It is
 * consequence 6 of ADR-010.
 */
export function generateRecoveryKey(): GeneratedRecoveryKey {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const text = toBase32(bytes) + checksumChar(bytes)

  return { bytes, formatted: groupRecoveryKey(text) }
}

/** What can go wrong when reading a key written by hand. */
export type RecoveryKeyProblem = 'longitud' | 'caracteres' | 'comprobacion'

/**
 * Interprets what the user has typed.
 *
 * It accepts lowercase, spaces and dashes because nobody copies respecting the format,
 * and refusing over that would mean picking a fight with someone trying to recover
 * their account. What it does not do is guess: if the check character does not add up,
 * it says so instead of deriving from something almost certainly wrong.
 */
export function parseRecoveryKey(
  input: string,
): { bytes: Uint8Array<ArrayBuffer> } | { problem: RecoveryKeyProblem } {
  const normalized = input.toUpperCase().replace(/[\s-]/g, '')

  if (normalized.length !== RECOVERY_KEY_LENGTH + 1) {
    return { problem: 'longitud' }
  }

  const body = normalized.slice(0, RECOVERY_KEY_LENGTH)
  const checksum = normalized.slice(RECOVERY_KEY_LENGTH)

  if ([...normalized].some((c) => !RECOVERY_ALPHABET.includes(c))) {
    return { problem: 'caracteres' }
  }

  const bytes = new Uint8Array(32)
  let bits = 0
  let value = 0
  let written = 0

  for (const c of body) {
    value = (value << BITS_PER_CHAR) | RECOVERY_ALPHABET.indexOf(c)
    bits += BITS_PER_CHAR

    if (bits >= 8) {
      bytes[written] = (value >>> (bits - 8)) & 0xff
      written += 1
      bits -= 8
    }
  }

  if (checksumChar(bytes) !== checksum) {
    return { problem: 'comprobacion' }
  }

  return { bytes }
}
