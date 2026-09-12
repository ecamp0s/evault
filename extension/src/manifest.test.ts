import { describe, expect, it } from 'vitest'
import { buildManifest } from './manifest'
import { onIdleStateChanged } from './systemLock'
import { messageFor } from './popupMessages'
import type { UnlockProblem } from './unlock'

describe('the manifest', () => {
  /*
   * ADR-023 §4: the permissions are the ones the extension uses and none more. Adding one
   * has to change this test, which is the moment to say which issue needs it.
   */
  it('asks for exactly the permissions this build uses', () => {
    expect(buildManifest(['https://vault.test']).permissions).toEqual(['idle', 'offscreen', 'storage'])
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
