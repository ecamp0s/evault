import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_EVENTS,
  CHECK_INTERVAL_MS,
  idleStateFor,
  INACTIVITY_LIMIT_MS,
  secondsUntilLock,
  WARNING_AT_MS,
} from './autoLock'

const MINUTE = 60 * 1000

describe('which state the vault is in, given the time without activity', () => {
  it('just used, it is active', () => {
    expect(idleStateFor(0)).toBe('active')
  })

  it('stays active right up to the moment of the warning', () => {
    expect(idleStateFor(WARNING_AT_MS - 1)).toBe('active')
  })

  it('warns at fourteen minutes', () => {
    expect(idleStateFor(WARNING_AT_MS)).toBe('warning')
    expect(idleStateFor(14 * MINUTE)).toBe('warning')
  })

  it('keeps warning up to the moment of locking, without locking early', () => {
    expect(idleStateFor(INACTIVITY_LIMIT_MS - 1)).toBe('warning')
  })

  it('at fifteen minutes it is time to lock', () => {
    expect(idleStateFor(INACTIVITY_LIMIT_MS)).toBe('expired')
    expect(idleStateFor(15 * MINUTE)).toBe('expired')
  })

  it('an enormous gap is still locking and not something else', () => {
    /*
     * The case of the tab that spent hours in the background. It matters because it is
     * the one a setTimeout would not have caught in time, and here it is not a special
     * case: it is the same subtraction.
     */
    expect(idleStateFor(8 * 60 * MINUTE)).toBe('expired')
  })
})

describe('the deadlines', () => {
  it('are fifteen minutes to lock and fourteen to warn', () => {
    expect(INACTIVITY_LIMIT_MS).toBe(15 * MINUTE)
    expect(WARNING_AT_MS).toBe(14 * MINUTE)
  })

  it('leave one minute between the warning and the lock', () => {
    // If this drops, the warning stops being any use for reacting.
    expect(INACTIVITY_LIMIT_MS - WARNING_AT_MS).toBe(MINUTE)
  })

  it('are checked far more often than the warning window is wide', () => {
    /*
     * Were the interval longer than the warning window, there would be gaps in which
     * the warning never gets shown and the vault locks without warning.
     */
    expect(CHECK_INTERVAL_MS).toBeLessThan(INACTIVITY_LIMIT_MS - WARNING_AT_MS)
  })
})

describe('the seconds the warning announces', () => {
  it('are sixty when the warning begins', () => {
    expect(secondsUntilLock(WARNING_AT_MS)).toBe(60)
  })

  it('round up so as not to announce zero early', () => {
    expect(secondsUntilLock(INACTIVITY_LIMIT_MS - 1)).toBe(1)
  })

  it('are never negative, even once the gap has passed the limit', () => {
    expect(secondsUntilLock(INACTIVITY_LIMIT_MS + 5 * MINUTE)).toBe(0)
  })
})

describe('what counts as activity', () => {
  it('does not include mousemove, which would keep a vault from ever locking', () => {
    /*
     * A mouse sitting on a window produces mousemove with any wobble of the desk. With
     * that, a desktop vault would never lock, and this test exists so that nobody adds
     * it for looking reasonable.
     */
    expect(ACTIVITY_EVENTS).not.toContain('mousemove')
  })

  it('includes typing, which is what stops the lock from binning a half-written item', () => {
    expect(ACTIVITY_EVENTS).toContain('keydown')
  })
})
