import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Whether this device keeps a copy of the vault so it can be read without a network.
 *
 * OFF BY DEFAULT, AND THAT IS THE DECISION AND NOT A DEFAULT NOBODY THOUGHT ABOUT.
 * `ADR-019` §2: caching the vault takes the rate limiting out of the way, because
 * guessing the master password against a local copy goes through no limiter at all.
 * Left on, a borrowed laptop or somebody else's browser would end up holding a copy of
 * the vault without anyone deciding it should.
 *
 * IT IS A DEVICE DECISION AND NOT AN ACCOUNT ONE, which is why it lives in
 * `localStorage` and not in the blob. Whether it is sensible to keep a copy here
 * depends on *here* — who else uses this machine, whether it leaves the house — and not
 * on who is logged in. The same person can reasonably say yes on their phone and no on
 * a shared desktop.
 *
 * There is no secret in this: it is a boolean saying whether somebody wants their vault
 * available without a network. It is the same reasoning as `sortPreference.ts` and
 * `generatorPreferences.ts`.
 *
 * THE KEY IS IN ENGLISH, like every other persisted one. It was `evault.sinred` for
 * exactly one issue, written by following a comment in `sortPreference.ts` that argued
 * for Spanish; #476 settled the rule the other way and renamed the family.
 *
 * The switch that flips this, and the text that explains it where it is flipped, are
 * #462. Until then it stays off, so no build that reaches the real instance starts
 * writing a copy of anybody's vault to their disk without being asked.
 */

interface OfflinePreferenceState {
  /** Whether this device may keep the encrypted vault for reading without a network. */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useOfflinePreference = create<OfflinePreferenceState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'evault.offline' },
  ),
)

/**
 * The same answer, for code that is not a React component.
 *
 * `vault/api.ts` needs it while resolving a request, which is not a render. It is the
 * same access `lib/api.ts` uses to read the token from the session store.
 */
export function offlineCacheEnabled(): boolean {
  return useOfflinePreference.getState().enabled
}
