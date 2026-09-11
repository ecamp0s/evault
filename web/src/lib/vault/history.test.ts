import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  capHistory,
  chooseFromHistory,
  confirmCurrent,
  forgetHistory,
  forgetHistoryEntry,
  hasUnconfirmed,
} from '@/lib/vault/history'
import { toContent, toFormData } from '@/lib/vault/schema'
import type { HistoryEntry, ItemContent } from '@/lib/vault/types'

const retired = (password: string, day = '01'): HistoryEntry => ({
  password,
  date: `2026-01-${day}T00:00:00.000Z`,
  origin: 'rotation',
})

const candidate = (password: string, day = '01'): HistoryEntry => ({
  password,
  date: `2026-02-${day}T00:00:00.000Z`,
  origin: 'import',
})

const entry = (history: HistoryEntry[], password = 'la-actual'): ItemContent => ({
  name: 'GitHub',
  url: 'https://github.com',
  username: 'ada',
  password,
  history,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-11T09:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

/*
 * The cap, written with THREE as a number and never as MAX_HISTORY: `ADR-018` §4 asked
 * for it by name, recalling the nineteen tests of Iteration 13 that moved with their
 * threshold. Moving the cap has to break these.
 */
describe('the cap on the history', () => {
  it('keeps three', () => {
    const four = [retired('a'), retired('b'), retired('c'), retired('d')]

    expect(capHistory(four).map((one) => one.password)).toEqual(['a', 'b', 'c'])
  })

  it('leaves a history within the cap exactly as it was', () => {
    const two = [candidate('a'), retired('b')]

    expect(capHistory(two)).toEqual(two)
  })

  /*
   * `ADR-022` §2.7: what is dropped is what was already decided. A retired password is
   * worth less than a candidate that may still be the good one.
   */
  it('drops a retired password before an undecided one, whatever the order', () => {
    const history = [retired('nueva'), retired('vieja'), candidate('de-otro-gestor'), retired('muy-vieja')]

    expect(capHistory(history).map((one) => one.password)).toEqual([
      'nueva',
      'vieja',
      'de-otro-gestor',
    ])
  })

  it('drops the oldest candidate only when nothing retired is left', () => {
    const history = [candidate('a'), candidate('b'), candidate('c'), candidate('d')]

    expect(capHistory(history).map((one) => one.password)).toEqual(['a', 'b', 'c'])
  })

  /*
   * THE EDGE IT LEAVES, fixed as a test so it stays a decision: three candidates and a new
   * password do not fit in three places, and the rule protects the candidates. It does not
   * occur over the real exports, where no entry ends up with more than two (#610).
   */
  it('loses the password just replaced when three candidates are already waiting', () => {
    const history = [retired('la-que-acabo-de-cambiar'), candidate('a'), candidate('b'), candidate('c')]

    expect(capHistory(history).map((one) => one.password)).toEqual(['a', 'b', 'c'])
  })
})

/*
 * THE BUG THIS MODULE EXISTS TO CLOSE, as it would have happened: an entry with one
 * candidate from another manager and two retired passwords. Its owner changes the
 * password in the editor. The rotation used to cut the history from the end, and the
 * end was the candidate — so the mark went off and a password that might have been the
 * right one disappeared, without anybody deciding anything.
 */
describe('rotating a password that still has candidates waiting', () => {
  it('keeps the candidate and drops the oldest retired password instead', () => {
    const before = entry([retired('vieja', '02'), retired('muy-vieja', '01'), candidate('de-otro-gestor')])

    const saved = toContent({ ...toFormData(before), password: 'la-nueva' }, before)

    expect(saved.history?.map((one) => one.password)).toEqual([
      'la-actual',
      'vieja',
      'de-otro-gestor',
    ])
    expect(hasUnconfirmed(saved)).toBe(true)
  })
})

describe('the mark of an unconfirmed entry', () => {
  it('is on when any password came from another manager unconfirmed', () => {
    expect(hasUnconfirmed(entry([retired('a'), candidate('b')]))).toBe(true)
  })

  it('is off with only retired passwords, or no history at all', () => {
    expect(hasUnconfirmed(entry([retired('a')]))).toBe(false)
    expect(hasUnconfirmed({ name: 'Sin historial' })).toBe(false)
  })
})

describe('saying the current password is the good one', () => {
  it('turns every candidate into a retired password and keeps them all', () => {
    const confirmed = confirmCurrent(entry([candidate('a'), retired('b'), candidate('c')]))

    expect(confirmed.password).toBe('la-actual')
    expect(confirmed.history?.map((one) => [one.password, one.origin])).toEqual([
      ['a', 'rotation'],
      ['b', 'rotation'],
      ['c', 'rotation'],
    ])
    expect(hasUnconfirmed(confirmed)).toBe(false)
  })

  /*
   * The date says when each password entered the history, and confirming does not make
   * that any less true.
   */
  it('leaves the dates alone', () => {
    const before = entry([candidate('a', '07')])

    expect(confirmCurrent(before).history?.[0].date).toBe(before.history?.[0].date)
  })

  it('does not touch the entry passed in', () => {
    const before = entry([candidate('a')])
    const copy = JSON.stringify(before)

    confirmCurrent(before)

    expect(JSON.stringify(before)).toBe(copy)
  })
})

describe('choosing a password from the history as the good one', () => {
  /*
   * A SWAP, AND NOTHING IS DELETED: whoever chooses wrong has to be able to come back,
   * and the password that was current goes into the history like any retired one.
   */
  it('makes it the current one and sends the current one to the history', () => {
    const chosen = chooseFromHistory(entry([candidate('de-otro-gestor')]), 0)

    expect(chosen.password).toBe('de-otro-gestor')
    expect(chosen.history).toEqual([
      { password: 'la-actual', date: '2026-09-11T09:00:00.000Z', origin: 'rotation' },
    ])
  })

  it('can be undone by choosing again', () => {
    const once = chooseFromHistory(entry([candidate('de-otro-gestor')]), 0)
    const back = chooseFromHistory(once, 0)

    expect(back.password).toBe('la-actual')
    expect(back.history?.[0].password).toBe('de-otro-gestor')
  })

  it('settles every other candidate too', () => {
    const chosen = chooseFromHistory(entry([candidate('a'), candidate('b')]), 1)

    expect(chosen.password).toBe('b')
    expect(hasUnconfirmed(chosen)).toBe(false)
    expect(chosen.history?.map((one) => one.password)).toEqual(['la-actual', 'a'])
  })

  it('respects the cap of three', () => {
    const full = entry([candidate('a'), retired('b'), retired('c')])

    expect(chooseFromHistory(full, 0).history).toHaveLength(3)
  })

  it('writes no retired password when the entry had none', () => {
    const noPassword: ItemContent = { name: 'X', history: [candidate('a')] }

    const chosen = chooseFromHistory(noPassword, 0)

    expect(chosen.password).toBe('a')
    expect(chosen.history).toBeUndefined()
  })

  it('changes nothing when asked for a position that is not there', () => {
    const before = entry([candidate('a')])

    expect(chooseFromHistory(before, 5)).toBe(before)
  })
})

describe('forgetting', () => {
  it('forgets one password and keeps the rest in order', () => {
    const after = forgetHistoryEntry(entry([retired('a'), candidate('b'), retired('c')]), 1)

    expect(after.history?.map((one) => one.password)).toEqual(['a', 'c'])
    expect(after.password).toBe('la-actual')
  })

  /*
   * Forgetting the last candidate turns the mark off, and that is allowed: it is an
   * explicit gesture with its own confirmation, stronger than «this is the good one».
   */
  it('turns the mark off when the last candidate is forgotten', () => {
    expect(hasUnconfirmed(forgetHistoryEntry(entry([candidate('a')]), 0))).toBe(false)
  })

  /*
   * Omitted when empty, never `[]`: forgetting the last entry must not leave a key saying
   * «none» in every blob that had one.
   */
  it('removes the key when the last password is forgotten', () => {
    expect('history' in forgetHistoryEntry(entry([retired('a')]), 0)).toBe(false)
  })

  it('forgets the whole history of an entry and removes the key', () => {
    const after = forgetHistory(entry([retired('a'), candidate('b')]))

    expect('history' in after).toBe(false)
    expect(after.password).toBe('la-actual')
  })
})
