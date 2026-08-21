import { describe, expect, it } from 'vitest'
import { securityPolicy } from './csp'

/*
 * A badly tuned CSP breaks the application in ways that only show up in the browser,
 * and sometimes only in production. These tests are no replacement for that check —it
 * has to be done anyway—, but they do prevent what a development browser would never
 * detect: the concessions Vite needs ending up travelling to the build the users get.
 */

const IN_PRODUCTION = { dev: false }
const IN_DEV = { dev: true }

/** The sources declared for one particular directive. */
function sourcesOf(policy: string, directive: string): string[] {
  const found = policy
    .split('; ')
    .find((chunk) => chunk.startsWith(`${directive} `))

  return found ? found.split(' ').slice(1) : []
}

describe('in production', () => {
  /*
   * The mistake that costs most and is easiest to make: the development mode's
   * concessions slipping into the build. With 'unsafe-inline' in script-src the policy
   * stops serving the one purpose it has.
   */
  it('admits neither inline scripts nor eval', () => {
    const script = sourcesOf(securityPolicy(IN_PRODUCTION), 'script-src')

    expect(script).toEqual(["'self'"])
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('does not leave the hot reload WebSocket open', () => {
    const connections = sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')

    expect(connections).not.toContain('ws:')
    expect(connections).not.toContain('wss:')
  })

  /*
   * The directive that limits where a script that did manage to run could send data to.
   * If it accepted any origin, the rest of the policy would be worth little in a
   * product whose asset is passwords.
   */
  it('only allows talking to the application itself', () => {
    expect(sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')).toEqual(["'self'"])
  })

  /*
   * Since ADR-016 the API shares an origin with the SPA, so `'self'` covers it and no
   * foreign origin is left to name. This case watches that one does not appear again:
   * an external origin in `connect-src` would be, in this product, a place an injected
   * script could send passwords to.
   */
  it('names no external origin', () => {
    const connections = sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')

    expect(connections.filter((source) => source.includes('://'))).toEqual([])
  })
})

describe('in development', () => {
  /*
   * An explicit criterion of the issue: npm run dev has to keep working, HMR included.
   * Vite injects its client as an inline script and React Refresh uses eval.
   */
  it('lets Vite and React Refresh start up', () => {
    const script = sourcesOf(securityPolicy(IN_DEV), 'script-src')

    expect(script).toContain("'unsafe-inline'")
    expect(script).toContain("'unsafe-eval'")
  })

  it('lets the hot reload WebSocket open', () => {
    const connections = sourcesOf(securityPolicy(IN_DEV), 'connect-src')

    expect(connections).toContain('ws:')
  })
})

describe('in both modes', () => {
  it.each([
    ['object-src', "'none'"],
    ['frame-src', "'none'"],
    ['worker-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
  ])('closes %s, which the application does not use', (directive, expected) => {
    for (const options of [IN_PRODUCTION, IN_DEV]) {
      expect(sourcesOf(securityPolicy(options), directive)).toEqual([expected])
    }
  })

  /*
   * Base UI, underneath shadcn, writes the position of dialogs and menus as a style
   * attribute. Without this concession the floating layers appear in the corner of the
   * screen, and it is a failure that does not show until one is opened.
   */
  it('admits inline styles, which Base UI needs in order to position', () => {
    expect(sourcesOf(securityPolicy(IN_PRODUCTION), 'style-src')).toContain("'unsafe-inline'")
  })

  it('starts from its own default-src', () => {
    expect(securityPolicy(IN_PRODUCTION).startsWith("default-src 'self'")).toBe(true)
  })
})
