import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_SKEW_MS,
  skewFromHeader,
  skewInWords,
  skewIsTooBig,
  useClockSkew,
} from '@/lib/vault/clockSkew'

/** A moment with a header to match, so the arithmetic is readable. */
const SERVER = 'Mon, 01 Sep 2026 10:00:00 GMT'
const SERVER_MS = Date.parse(SERVER)

beforeEach(() => {
  useClockSkew.setState({ skewMs: null })
})

describe('skewFromHeader', () => {
  it('is zero when the two clocks agree', () => {
    expect(skewFromHeader(SERVER, SERVER_MS)).toBe(0)
  })

  it('is positive when this device runs ahead', () => {
    expect(skewFromHeader(SERVER, SERVER_MS + 45_000)).toBe(45_000)
  })

  it('is negative when it runs behind', () => {
    expect(skewFromHeader(SERVER, SERVER_MS - 45_000)).toBe(-45_000)
  })

  /*
   * A response with no readable header is a real case and not a defect: an error with no
   * response at all, or a proxy that strips it. NOT KNOWING IS NOT THE SAME AS AGREEING,
   * so it has to come back as nothing rather than as zero — a zero would state that the
   * clocks match, which is precisely what has not been measured.
   */
  it.each([
    ['nothing at all', undefined],
    ['something that is not text', 12345],
    ['text that is not a date', 'ayer por la tarde'],
  ])('gives nothing for %s, instead of claiming agreement', (_, header) => {
    expect(skewFromHeader(header, SERVER_MS)).toBeNull()
  })
})

describe('skewIsTooBig', () => {
  it('says nothing while no response has been read', () => {
    expect(skewIsTooBig(null)).toBe(false)
  })

  /*
   * The threshold is ONE FULL STEP, and it is not chosen by eye: services almost always
   * accept the previous code and the next, so a device off by less than a step still
   * lands inside that tolerance. Warning earlier would fire when nothing is wrong, and a
   * notice that cries wolf gets ignored along with the ones that mean something (#62).
   */
  it.each([0, 1_000, 29_999, -29_999])('keeps quiet at %i ms, which the services absorb', (skew) => {
    expect(skewIsTooBig(skew)).toBe(false)
  })

  it.each([MAX_SKEW_MS, -MAX_SKEW_MS, 90_000, -90_000])(
    'warns at %i ms, where being accepted stops depending on the clock',
    (skew) => {
      expect(skewIsTooBig(skew)).toBe(true)
    },
  )
})

describe('skewInWords', () => {
  /*
   * IT NAMES THE DIRECTION because that is what somebody can act on. A number of
   * milliseconds sends nobody to their clock, which is the whole point of ADR-017 §5.4:
   * telling a drifted clock apart from eVault being broken.
   */
  it('says how far and which way, ahead', () => {
    expect(skewInWords(45_000)).toBe('45 segundos adelantado')
  })

  it('says how far and which way, behind', () => {
    expect(skewInWords(-90_000)).toBe('90 segundos atrasado')
  })

  it('agrees in number for a single second', () => {
    expect(skewInWords(1_000)).toBe('1 segundo adelantado')
  })
})

describe('the store', () => {
  it('starts knowing nothing, which is not the same as agreeing', () => {
    expect(useClockSkew.getState().skewMs).toBeNull()
    expect(skewIsTooBig(useClockSkew.getState().skewMs)).toBe(false)
  })

  it('keeps the last skew read', () => {
    useClockSkew.getState().note(45_000)

    expect(useClockSkew.getState().skewMs).toBe(45_000)
  })
})
