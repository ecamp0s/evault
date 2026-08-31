import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  InvalidTotpSeed,
  decodeBase32,
  parseTotp,
  secondsRemaining,
  totpCode,
  type TotpAlgorithm,
} from '@/lib/vault/totp'

/**
 * The seeds of RFC 6238 Appendix B, in base32 as a real service hands them over.
 *
 * The RFC prints them as the ASCII «12345678901234567890» repeated to the length each
 * hash wants. They are written here already encoded because that is the form this
 * module receives, and encoding them in the test would be testing the test.
 */
const SEEDS: Record<TotpAlgorithm, string> = {
  SHA1: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  SHA256: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====',
  SHA512:
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=',
}

/**
 * The table of RFC 6238 Appendix B, seconds and the eight-digit code each one gives.
 *
 * IT IS THE CRITERION OF THIS ISSUE AND NOT AN ILLUSTRATION. A TOTP done wrong returns
 * six plausible digits rather than an error, so there is nothing to inspect and no way
 * to tell by looking: the only proof that this module is right is that it reproduces a
 * table somebody else published.
 *
 * Cross-checked against an independent implementation —Python's stdlib `hmac`— before
 * writing a line of the module, so that a wrong recollection could not end up being
 * «fixed» by adjusting the expectations to whatever this code happened to produce.
 */
const VECTORS: [seconds: number, sha1: string, sha256: string, sha512: string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
]

/** The parameters of the RFC's table: eight digits, thirty seconds, T0 at zero. */
function vectorParameters(algorithm: TotpAlgorithm) {
  return {
    secret: decodeBase32(SEEDS[algorithm]),
    digits: 8,
    period: 30,
    algorithm,
  }
}

describe('totpCode', () => {
  describe('the RFC 6238 vectors', () => {
    for (const [seconds, sha1, sha256, sha512] of VECTORS) {
      it(`gives the published codes at T=${seconds}`, async () => {
        const at = seconds * 1000

        expect(await totpCode(vectorParameters('SHA1'), at)).toBe(sha1)
        expect(await totpCode(vectorParameters('SHA256'), at)).toBe(sha256)
        expect(await totpCode(vectorParameters('SHA512'), at)).toBe(sha512)
      })
    }
  })

  /*
   * THIS ONE IS NOT FROM THE RFC, AND IT IS HERE BECAUSE THE RFC DOES NOT COVER IT.
   *
   * Its furthest row, T=20000000000, is past 2^31 SECONDS — which catches a 32-bit
   * signed time in C — but its counter is only 666666666, comfortably inside 32 bits.
   * So every published vector passes with a counter written as a 32-bit value, and
   * writing the eight-byte message that way survives the whole table. Found by mutating
   * `setBigUint64` to `setUint32` and watching all 29 tests stay green.
   *
   * The counter passes 2^32 at 2^32 × 30 seconds, so that is where this reads. The two
   * expected codes come from an independent implementation —Python's stdlib `hmac`—
   * for the same reason the RFC table is used elsewhere: an expectation produced by the
   * code under test would only prove the code agrees with itself.
   */
  it('holds past the point where a 32-bit counter overflows', async () => {
    const overflow = 4294967296 * 30 * 1000

    expect(await totpCode(vectorParameters('SHA1'), overflow)).toBe('55999456')
    expect(await totpCode(vectorParameters('SHA1'), overflow + 12345 * 1000)).toBe('35096434')
  })

  it('pads a code that comes out shorter than its digits', async () => {
    expect(await totpCode(vectorParameters('SHA1'), 1111111109 * 1000)).toBe('07081804')
  })

  /*
   * The RFC lists 1111111109 and 1111111111 next to each other precisely because they
   * straddle a boundary: the window ends at 1111111110, so the two seconds either side
   * of it give different codes. The pair is what makes a window a window, and getting
   * this backwards while writing the test is what showed the assertion was worth having.
   */
  it('holds one code across its window and changes on the boundary', async () => {
    const parameters = vectorParameters('SHA1')
    const before = await totpCode(parameters, 1111111109 * 1000)

    expect(await totpCode(parameters, 1111111080 * 1000)).toBe(before)
    expect(await totpCode(parameters, 1111111109 * 1000 + 999)).toBe(before)
    expect(await totpCode(parameters, 1111111110 * 1000)).not.toBe(before)
  })
})

describe('decodeBase32', () => {
  it('reads a seed as it is printed to be read aloud', () => {
    expect(decodeBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(
      decodeBase32(SEEDS.SHA1),
    )
  })

  it('accepts a seed with padding and the same one without it', () => {
    expect(decodeBase32('GEZDGNBVGY3TQOJQGEZA====')).toEqual(decodeBase32('GEZDGNBVGY3TQOJQGEZA'))
  })

  /*
   * Base32 has no 0, 1 or 8, and somebody transcribing by hand writes O for zero and l
   * for one. Skipping the character quietly would build a seed a few bits off, which
   * produces plausible codes forever.
   */
  it.each(['GEZDGNBV0Y3TQOJQ', 'GEZDGNBV1Y3TQOJQ', 'GEZDGNBV8Y3TQOJQ'])(
    'refuses %s instead of skipping the character it cannot read',
    (seed) => {
      expect(() => decodeBase32(seed)).toThrow(InvalidTotpSeed)
    },
  )

  it('refuses a seed cut short in the middle of a byte', () => {
    expect(() => decodeBase32('GEZDGNBVB')).toThrow(InvalidTotpSeed)
  })

  it('refuses an empty seed', () => {
    expect(() => decodeBase32('   ')).toThrow(InvalidTotpSeed)
  })
})

describe('parseTotp', () => {
  it('takes a bare seed with the RFC defaults, which are the ones a URI leaves out', () => {
    const parsed = parseTotp(SEEDS.SHA1)

    expect(parsed.digits).toBe(DEFAULT_DIGITS)
    expect(parsed.period).toBe(DEFAULT_PERIOD)
    expect(parsed.algorithm).toBe(DEFAULT_ALGORITHM)
  })

  it('reads the parameters a URI declares', () => {
    const parsed = parseTotp(
      `otpauth://totp/GitHub:ada@example.com?secret=${SEEDS.SHA256}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`,
    )

    expect(parsed).toMatchObject({
      digits: 8,
      period: 60,
      algorithm: 'SHA256',
      issuer: 'GitHub',
      account: 'ada@example.com',
    })
  })

  it('takes the issuer from the label when there is no parameter', () => {
    expect(parseTotp(`otpauth://totp/GitHub:ada@example.com?secret=${SEEDS.SHA1}`)).toMatchObject({
      issuer: 'GitHub',
      account: 'ada@example.com',
    })
  })

  /*
   * ADR-017 §4: the parameters are read from the URI and no defaults are invented in
   * silence. Reading `algorithm=SHA512` and hashing with SHA-1 anyway is the exact
   * shape of the failure this module cannot afford — it would produce codes nobody
   * accepts, with nothing failing anywhere.
   */
  it('refuses an algorithm it cannot honour instead of falling back to SHA-1', () => {
    expect(() => parseTotp(`otpauth://totp/x?secret=${SEEDS.SHA1}&algorithm=MD5`)).toThrow(
      InvalidTotpSeed,
    )
  })

  it.each(['digits=4', 'digits=abc', 'period=0', 'period=-30'])(
    'refuses %s instead of quietly using the default',
    (parameter) => {
      expect(() => parseTotp(`otpauth://totp/x?secret=${SEEDS.SHA1}&${parameter}`)).toThrow(
        InvalidTotpSeed,
      )
    },
  )

  it('refuses a URI with no seed in it', () => {
    expect(() => parseTotp('otpauth://totp/GitHub:ada@example.com?issuer=GitHub')).toThrow(
      InvalidTotpSeed,
    )
  })

  it('refuses an otpauth:// address that is not an address at all', () => {
    expect(() => parseTotp('otpauth:// totp/x')).toThrow(InvalidTotpSeed)
  })

  it('refuses hotp, which counts events and not time', () => {
    expect(() => parseTotp(`otpauth://hotp/x?secret=${SEEDS.SHA1}&counter=1`)).toThrow(
      InvalidTotpSeed,
    )
  })

  it('produces parameters that generate the RFC code, URI and bare seed alike', async () => {
    const fromUri = parseTotp(`otpauth://totp/x?secret=${SEEDS.SHA1}&digits=8`)

    expect(await totpCode(fromUri, 59000)).toBe('94287082')
  })
})

describe('secondsRemaining', () => {
  it('counts down to the end of the window and starts over', () => {
    const parameters = vectorParameters('SHA1')

    expect(secondsRemaining(parameters, 0)).toBe(30)
    expect(secondsRemaining(parameters, 1000)).toBe(29)
    expect(secondsRemaining(parameters, 29_000)).toBe(1)
    expect(secondsRemaining(parameters, 30_000)).toBe(30)
  })

  it('never reaches zero, because a code with no seconds left is one already gone', () => {
    for (let second = 0; second < 120; second += 1) {
      const left = secondsRemaining(vectorParameters('SHA1'), second * 1000)

      expect(left).toBeGreaterThan(0)
      expect(left).toBeLessThanOrEqual(30)
    }
  })
})
