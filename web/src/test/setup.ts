import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { toast } from 'sonner'

/*
 * HEADROOM FOR THE 97 findBy/waitFor CALLS IN THE SUITE. Related to #259, but be
 * careful about what this line does and does not do — it was mutated to find out.
 *
 * Testing Library gives up after 1s by default, and that budget is independent of
 * testTimeout in vite.config.ts: raising one does nothing for the other.
 *
 * THIS LINE DID NOT FIX #259, and saying so here is the point. Reverting it to 1s
 * while keeping the test timeout raised leaves the suite green, 5 loaded runs out
 * of 5. The line that fixes #259 is testTimeout in vite.config.ts; this one is
 * headroom, kept because 1s against the slowest waits in the suite — measured at
 * 2242ms inside a full run — is not a margin at all, and because CI runners have 2
 * cores where none of this was measured.
 *
 * AND THE ORDER MATTERS, which is the trap worth leaving written down: this value
 * must stay well below testTimeout. Raising it to 5s while testTimeout was still at
 * its 5s default made things WORSE than doing nothing — 5 red runs out of 5,
 * against 20 out of 30 originally — because the wait consumed the whole test's
 * budget and the test died before the query could report anything useful.
 */
configure({ asyncUtilTimeout: 5_000 })

/*
 * jsdom does not implement matchMedia, and sonner calls it when mounting the Toaster to
 * find out whether the system asks for less animation. Without this patch, any test
 * checking a notice blows up before reaching the assertion.
 *
 * It always answers that there is no match, which amounts to the system's default
 * preferences.
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

beforeEach(() => {
  // The session store persists in localStorage. Without clearing it, a test that
  // authenticates leaves the next one with an open session and the execution order
  // starts to matter, which is the most expensive class of intermittent failure to
  // diagnose.
  localStorage.clear()
})

afterEach(() => {
  /*
   * SONNER'S NOTICES DO NOT LIVE IN REACT'S TREE. Their state is global to the module,
   * so `cleanup()` unmounts the Toaster and leaves them where they were; on mounting
   * the next one, they reappear, and a test ends up seeing the notices of the previous
   * ones.
   *
   * Found in #232 while investigating why updating sonner to 2.0.8 turned two tests of
   * `copy.test.tsx` red with «Found multiple elements». It was neither a duplication of
   * the component nor an extra accessibility node —a single notice produces exactly one
   * node, checked— but three notices piled up from three different tests.
   *
   * The tempting fix was changing `getByText` for `getAllByText`, and it would have
   * been worse than the problem: it leaves the leak alive, and a leak like that makes a
   * test pass or fail ACCORDING TO THE EXECUTION ORDER. It is exactly the failure of
   * #186, which cost somebody else's PR a red run.
   */
  toast.dismiss()
  cleanup()
})
