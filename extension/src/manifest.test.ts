import { describe, expect, it } from 'vitest'
import { FIREFOX_ID, buildFirefoxManifest, buildManifest } from './manifest'
import { onIdleStateChanged } from './platform/chrome/systemLock'
import { copiedMessageFor, fillMessageFor, listMessageFor, messageFor, summaryFor } from './popupMessages'
import type { UnlockProblem } from './unlock'

describe('the manifest', () => {
  /*
   * ADR-023 §4: the permissions are the ones the extension uses and none more. Adding one
   * has to change this test, which is the moment to say which issue needs it.
   */
  it('asks for exactly the permissions this build uses', () => {
    expect(buildManifest(['https://vault.test']).permissions).toEqual([
      'activeTab',
      'clipboardWrite',
      'idle',
      'offscreen',
      'scripting',
      'storage',
    ])
  })

  /*
   * #672 measured that without it the clipboard is not cleared and nothing says so. A
   * password copied from the popup would stay there with the popup promising otherwise.
   */
  it('keeps clipboardWrite, without which clearing the clipboard silently does nothing', () => {
    expect(buildManifest(['https://vault.test']).permissions).toContain('clipboardWrite')
  })

  it('reads the open tab with activeTab and never with tabs, which would read every tab', () => {
    const { permissions } = buildManifest(['https://vault.test'])
    expect(permissions).toContain('activeTab')
    expect(permissions).not.toContain('tabs')
  })

  it('declares no content scripts: nothing of the extension runs in a page on its own', () => {
    expect(buildManifest(['https://vault.test'])).not.toHaveProperty('content_scripts')
  })

  it('reaches only the instance origins', () => {
    expect(buildManifest(['https://a.test', 'https://b.test']).host_permissions).toEqual([
      'https://a.test/*',
      'https://b.test/*',
    ])
  })

  /*
   * #671: Chrome refuses a WebAuthn RP ID whose only host permission carries a port, and
   * fetch is happy with either. The development instance lives on 5173.
   */
  it('drops the port, which WebAuthn needs and fetch does not mind', () => {
    expect(buildManifest(['http://localhost:5173']).host_permissions).toEqual(['http://localhost/*'])
  })
})

describe("Firefox's manifest (ADR-025 §4)", () => {
  const manifest = buildFirefoxManifest(['http://localhost:5173', 'https://vault.test'])

  /*
   * Manifest V2 because its background page can be persistent, which is where the key
   * lives: Firefox's V3 background unloads and would take the key with it (#748).
   */
  it('is Manifest V2 with a persistent background page, where the key lives', () => {
    expect(manifest.manifest_version).toBe(2)
    expect(manifest.background).toEqual({ page: 'background.html', persistent: true })
  })

  it("asks for Chrome's permissions minus offscreen and idle, which do nothing there", () => {
    expect(manifest.permissions).toEqual([
      'activeTab',
      'clipboardWrite',
      'scripting',
      'storage',
      'http://localhost/*',
      'https://vault.test/*',
    ])
  })

  it('carries the identifier tied to the signing account, and declares it collects nothing', () => {
    expect(manifest.browser_specific_settings.gecko.id).toBe(FIREFOX_ID)
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] })
  })

  /*
   * #749: Mozilla refused the first submission for its name. And without update_url
   * Firefox only asks Mozilla, which offers no unlisted versions: updating stays manual.
   */
  it('has a name Mozilla accepts and no update_url', () => {
    expect(manifest.name).not.toMatch(/firefox|mozilla/i)
    expect(JSON.stringify(manifest)).not.toContain('update_url')
  })

  it('declares no content scripts, as in Chrome', () => {
    expect(manifest).not.toHaveProperty('content_scripts')
  })

  it('carries the same version as the Chrome build', () => {
    expect(manifest.version).toBe(buildManifest([]).version)
  })
})

describe('locking with the operating system', () => {
  it('forgets the key when the system locks', () => {
    const posted: unknown[] = []
    onIdleStateChanged('locked', (message) => posted.push(message))

    expect(posted).toEqual([{ op: 'forget', reason: 'system-locked' }])
  })

  it('does not lock on idle, which the inactivity limit already measures', () => {
    const posted: unknown[] = []
    onIdleStateChanged('idle', (message) => posted.push(message))
    onIdleStateChanged('active', (message) => posted.push(message))

    expect(posted).toEqual([])
  })
})

describe('what the popup says', () => {
  const problems: UnlockProblem[] = ['unsupported', 'refused', 'throttled', 'offline', 'mismatch', 'failed']

  it('says something for every failure that is not a change of mind', () => {
    for (const problem of problems) expect(messageFor(problem)).toMatch(/\S/)
  })

  it('says nothing when the dialog was dismissed', () => {
    expect(messageFor('cancelled')).toBeNull()
  })

  it('never blames the connection for an answer the instance gave', () => {
    for (const problem of problems.filter((p) => p !== 'offline')) {
      expect(messageFor(problem)).not.toMatch(/conexión|red\b/i)
    }
  })
})

describe('what the popup says about the list', () => {
  it('says how many were cut when the cap applies, and how to find the rest', () => {
    expect(summaryFor(120, 50, 0, true)).toMatch(/120.*50.*afinar/)
  })

  it('invites to search when the open site has no entries', () => {
    expect(summaryFor(0, 0, 0, false)).toMatch(/Escribe para buscar/)
  })

  it('promises the clearing only for what is cleared', () => {
    expect(copiedMessageFor('password', 30)).toMatch(/30 segundos/)
    expect(copiedMessageFor('code', 30)).toMatch(/30 segundos/)
    expect(copiedMessageFor('username', 30)).not.toMatch(/borrar/)
  })

  it('blames the connection only when there is none', () => {
    expect(listMessageFor('offline')).toMatch(/conexión/)
    expect(listMessageFor('expired')).not.toMatch(/conexión/)
  })
})

describe('what the popup says about filling', () => {
  it('says nothing when it filled: the popup closes and the page is the message', () => {
    expect(fillMessageFor('filled')).toBeNull()
  })

  it('says why for everything it refused', () => {
    for (const outcome of ['password-only', 'no-password-field', 'other-site', 'insecure', 'not-top-frame', 'unreachable'] as const) {
      expect(fillMessageFor(outcome)).toMatch(/\S/)
    }
  })
})
