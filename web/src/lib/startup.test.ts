import { describe, expect, it } from 'vitest'
// With ?raw and not by reading the file with node:fs: that way the test does not need
// Node's types in tsconfig.app.json, which would force exposing the system APIs to all
// the client code, and neither does it depend on the directory Vitest is invoked from.
import html from '../../index.html?raw'

/*
 * The layer that stops a failed start-up from showing itself as a blank page. See issue
 * #107.
 *
 * This file does not test a function: it protects a promise. What it watches over is
 * that nobody can leave the application mute without anything failing, by emptying
 * index.html's notice.
 *
 * UNTIL ISSUE #296 it also watched a second layer, `assertApiUrl`, which aborted the
 * start-up when `VITE_API_URL` was missing. That check was withdrawn along with the
 * variable: since ADR-016 the API's URL is relative and there is nothing to configure,
 * so no configuration is left that could be missing.
 */

describe('a failed start-up is never a blank page', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const root = document.querySelector('#root')

  it('index.html leaves a notice inside #root', () => {
    expect(root).not.toBeNull()
    expect(root?.textContent?.trim()).not.toBe('')
  })

  it('the notice explains what to do, not just that something failed', () => {
    expect(root?.textContent).toContain('docker compose up --build')
  })

  /*
   * index.css is imported from main.tsx, which is exactly what has not run when this
   * notice is left in view. If somebody moves these styles into an application
   * stylesheet, the notice would still be in the DOM but would look like unformatted
   * text, and the test would keep passing without this case.
   */
  it('the notice does not depend on the application CSS, which never loaded', () => {
    const withOwnStyles = root?.querySelectorAll('[style]') ?? []

    expect(withOwnStyles.length).toBeGreaterThan(0)
  })
})
