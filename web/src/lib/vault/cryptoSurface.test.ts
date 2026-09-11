import { describe, expect, it } from 'vitest'

/**
 * Where `crypto.subtle` is called, checked instead of stated.
 *
 * IT WAS STATED, AND IT WAS FALSE. crypto.ts's header, web/README.md and
 * SPRINT_CONTEXT.md all said crypto.ts was the only file that calls it, and totp.ts has
 * called it for the HMAC of TOTP codes since Iteration 13 (ADR-017). ADR-023 §2.8 then
 * repeated the sentence without checking it, and an ADR cannot be corrected. Found in
 * #670, planning a test that would have failed on the first run.
 *
 * TWO FILES, AND THE DIFFERENCE BETWEEN THEM IS THE POINT: crypto.ts is where every key
 * that opens the vault is derived and wrapped; totp.ts signs with a TOTP seed and never
 * sees a vault key. A third file here is a new place doing cryptography, and it should
 * be a decision and not something found by reading.
 *
 * The extension has a twin of this that allows none: extension/src/oneImplementation.test.ts.
 */

// With ?raw, like installable.test.ts: Vite hands over the text, so the test needs no
// Node types and runs under jsdom like every other one.
const sources = import.meta.glob<string>(
  ['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}', '!../../test/**'],
  { query: '?raw', import: 'default', eager: true },
)
// Vite writes each key relative to THIS file (`./crypto.ts`, `../session.ts`), not to
// the pattern, so they are resolved from here into paths relative to src/.
const files = Object.fromEntries(
  Object.entries(sources).map(([path, text]) => [
    new URL(path, 'file:///src/lib/vault/').pathname.replace(/^\/src\//, ''),
    text,
  ]),
)

const ALLOWED = ['lib/vault/crypto.ts', 'lib/vault/totp.ts']

describe('where crypto.subtle is called', () => {
  it('looks at the whole of src, so a wrong glob cannot pass by finding nothing', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining([...ALLOWED, 'main.tsx']))
  })

  it('is only crypto.ts, for the vault keys, and totp.ts, for the HMAC of a code', () => {
    const callers = Object.entries(files)
      .filter(([, text]) => /crypto\.subtle\s*\./.test(text))
      .map(([path]) => path)
      .sort()

    expect(callers).toEqual(ALLOWED)
  })
})
