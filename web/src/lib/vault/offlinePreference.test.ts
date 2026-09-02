import { beforeEach, describe, expect, it } from 'vitest'
import { offlineCacheEnabled, useOfflinePreference } from '@/lib/vault/offlinePreference'

/*
 * Whether this device keeps a copy of the vault. See ADR-019 and issue #459.
 *
 * The test that matters is the first one, and it is not about a store working: it is
 * that nobody can turn this on by accident. ADR-019 §2 leaves it off because a cached
 * vault takes the rate limiting out of the way, so a borrowed laptop must not end up
 * holding one without somebody deciding it should.
 */

beforeEach(() => {
  useOfflinePreference.setState({ enabled: false })
  localStorage.clear()
})

describe('keeping the vault on this device', () => {
  it('is off until somebody says otherwise', () => {
    expect(useOfflinePreference.getState().enabled).toBe(false)
    expect(offlineCacheEnabled()).toBe(false)
  })

  it('can be turned on and off', () => {
    useOfflinePreference.getState().setEnabled(true)
    expect(offlineCacheEnabled()).toBe(true)

    useOfflinePreference.getState().setEnabled(false)
    expect(offlineCacheEnabled()).toBe(false)
  })

  /*
   * It is a decision about *this device* — who else uses this machine, whether it
   * leaves the house — so it is remembered here and not in the blob. The same person
   * can reasonably say yes on their phone and no on a shared desktop.
   */
  it('is remembered in this browser, under its own key', () => {
    useOfflinePreference.getState().setEnabled(true)

    expect(localStorage.getItem('evault.sinred')).toContain('"enabled":true')
  })
})
