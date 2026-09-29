import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetTabSession, rememberTabSession, replacingTabSession } from './tabSession'

/*
 * The id of the tab's token, kept across a reload so signing in again replaces it (#725).
 * What this file protects: that only the id is kept and never the token, and that a
 * browser refusing storage keeps working exactly as before.
 */

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the id of the tab session', () => {
  it('keeps the id of a Sanctum token, and hands it over to the next sign-in', () => {
    rememberTabSession('42|el-secreto-del-token')

    expect(replacingTabSession()).toEqual({ replaces: 42 })
  })

  it('keeps the id and never the secret half', () => {
    rememberTabSession('42|el-secreto-del-token')

    const stored = Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)).join(' ')
    expect(stored).not.toContain('el-secreto-del-token')
  })

  it('with nothing kept, a sign-in replaces nothing', () => {
    expect(replacingTabSession()).toEqual({})
  })

  it('ignores a token that does not have the id|secret shape', () => {
    rememberTabSession('token-de-prueba')

    expect(replacingTabSession()).toEqual({})
  })

  it('signing out for real forgets it', () => {
    rememberTabSession('42|x')
    forgetTabSession()

    expect(replacingTabSession()).toEqual({})
  })

  it('a browser that refuses storage keeps working, replacing nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(() => rememberTabSession('42|x')).not.toThrow()
    expect(() => forgetTabSession()).not.toThrow()
    expect(replacingTabSession()).toEqual({})
  })
})
