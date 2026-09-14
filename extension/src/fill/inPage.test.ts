// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { hostOf } from '@/lib/vault/host'
import { fillInPage, type PageWindow } from './inPage'

/**
 * jsdom has no layout, so every field measures 0×0 and nothing is «visible». The tests give
 * each field a box and a visibility, which is what makes them able to say which one is
 * hidden. That a real browser measures them the same way is the job of the Chromium check
 * of #673, not of this file.
 */
function field(html: string) {
  document.body.insertAdjacentHTML('beforeend', html)
}

interface Box { left?: number; top?: number; width?: number; height?: number; visible?: boolean }

/** Gives every input a box, default 200×24 at (100, 76). Containers get one through `clip`. */
function layout(boxes: Record<string, Box>) {
  for (const input of Array.from(document.querySelectorAll('input'))) {
    const box = { left: 100, top: 76, width: 200, height: 24, visible: true, ...boxes[input.id] }
    input.getBoundingClientRect = () => rect(box)
    input.checkVisibility = () => box.visible
  }
}

function rect({ left = 0, top = 0, width = 0, height = 0 }: Box): DOMRect {
  const r = { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }
  return { ...r, toJSON: () => r } as DOMRect
}

/** Makes an element clip its content to a box, as `overflow: hidden` does. */
function clip(id: string, box: Box) {
  const element = document.getElementById(id)!
  // The two longhands and not `overflow`: jsdom does not expand the shorthand, and the
  // function reads the computed longhands, which is what a browser reports.
  element.style.overflowX = 'hidden'
  element.style.overflowY = 'hidden'
  element.getBoundingClientRect = () => rect(box)
}

function page(url = 'https://www.example.com/login', top?: unknown): PageWindow {
  const { protocol, hostname } = new URL(url)
  const win = { location: { protocol, hostname }, document, HTMLInputElement, getComputedStyle: (e: Element) => getComputedStyle(e) } as unknown as PageWindow
  win.top = top ?? win
  return win
}

const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value

describe('filling a login form in the page', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('fills the username and the password of the form', () => {
    field('<form><input id="user" type="email"><input id="pass" type="password"></form>')
    layout({})

    expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('filled')
    expect(value('user')).toBe('ada@example.com')
    expect(value('pass')).toBe('s3cr3t')
  })

  it('tells the page the value changed, so a framework does not submit it empty', () => {
    field('<form><input id="user"><input id="pass" type="password"></form>')
    layout({})
    const seen: string[] = []
    document.getElementById('pass')!.addEventListener('input', () => seen.push('input'))
    document.getElementById('pass')!.addEventListener('change', () => seen.push('change'))

    fillInPage('ada', 's3cr3t', 'example.com', page())

    expect(seen).toEqual(['input', 'change'])
  })

  it('never submits the form', () => {
    field('<form id="f"><input id="user"><input id="pass" type="password"></form>')
    layout({})
    let submitted = false
    document.getElementById('f')!.addEventListener('submit', () => (submitted = true))

    fillInPage('ada', 's3cr3t', 'example.com', page())

    expect(submitted).toBe(false)
  })

  describe('where it refuses', () => {
    beforeEach(() => {
      field('<form><input id="user"><input id="pass" type="password"></form>')
      layout({})
    })

    it('refuses a frame that is not the top one', () => {
      expect(fillInPage('ada', 's3cr3t', 'example.com', page(undefined, {}))).toBe('not-top-frame')
      expect(value('pass')).toBe('')
    })

    it('refuses a host that only ends like the entry one', () => {
      expect(fillInPage('ada', 's3cr3t', 'example.com', page('https://example.com.attacker.net/'))).toBe('other-site')
      expect(value('pass')).toBe('')
    })

    it('refuses another subdomain of the same site, which is another credential', () => {
      expect(fillInPage('ada', 's3cr3t', 'example.com', page('https://dev.example.com/'))).toBe('other-site')
    })

    it('refuses plain http, where the password would travel in the clear', () => {
      expect(fillInPage('ada', 's3cr3t', 'example.com', page('http://example.com/login'))).toBe('insecure')
      expect(value('pass')).toBe('')
    })

    /*
     * Found by mutation in #673: `includes('localhost')` passed every test above, and it
     * would hand a password in the clear to a host that only borrows the word.
     */
    it('refuses http on a host that only contains the word localhost', () => {
      for (const url of ['http://localhost.attacker.com/', 'http://evil-localhost.com/', 'http://mylocalhost/']) {
        const { hostname } = new URL(url)
        expect(fillInPage('ada', 's3cr3t', hostname, page(url))).toBe('insecure')
      }
      expect(value('pass')).toBe('')
    })

    it('accepts http on localhost, which is a secure context', () => {
      expect(fillInPage('ada', 's3cr3t', 'app.evault.localhost', page('http://app.evault.localhost/'))).toBe('filled')
    })
  })

  describe('invisible forms', () => {
    const cases = {
      'hidden by CSS': { visible: false },
      'zero-sized': { width: 0, height: 0 },
      'pushed off to the left': { left: -9999 },
      'pushed off above': { top: -9999 },
    }

    for (const [name, box] of Object.entries(cases)) {
      it(`does not fill a password field ${name}`, () => {
        field('<form><input id="user"><input id="pass" type="password"></form>')
        layout({ pass: box })

        expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('no-password-field')
        expect(value('pass')).toBe('')
      })
    }

    /*
     * The case the Chromium check found and these tests did not: the field measures
     * 200×24 and checkVisibility says yes, and its container shows none of it.
     */
    it('does not fill a field its container clips away entirely', () => {
      field('<div id="box"><form><input id="user"><input id="pass" type="password"></form></div>')
      layout({})
      clip('box', { left: 100, top: 76, width: 0, height: 0 })

      expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('pass')).toBe('')
    })

    it('fills a field its container only clips in part', () => {
      field('<div id="box"><form><input id="user"><input id="pass" type="password"></form></div>')
      layout({})
      clip('box', { left: 100, top: 76, width: 50, height: 24 })

      expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('filled')
    })

    it('fills the visible form and leaves the invisible trap before it empty', () => {
      field('<form><input id="trapUser"><input id="trap" type="password"></form>')
      field('<form><input id="user"><input id="pass" type="password"></form>')
      layout({ trapUser: { visible: false }, trap: { visible: false } })

      expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('filled')
      expect(value('trap')).toBe('')
      expect(value('trapUser')).toBe('')
      expect(value('pass')).toBe('s3cr3t')
    })

    it('does not fill a hidden username field, and says the username did not go in', () => {
      field('<form><input id="user"><input id="pass" type="password"></form>')
      layout({ user: { visible: false } })

      expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('password-only')
      expect(value('user')).toBe('')
    })
  })

  it('does not fill a disabled or read-only field', () => {
    field('<form><input id="user"><input id="pass" type="password" readonly></form>')
    layout({})

    expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('no-password-field')
  })

  it('takes the username from the password form and not from a search box before it', () => {
    field('<input id="search" type="text">')
    field('<form><input id="user" type="email"><input id="pass" type="password"></form>')
    layout({})

    fillInPage('ada', 's3cr3t', 'example.com', page())

    expect(value('search')).toBe('')
    expect(value('user')).toBe('ada')
  })

  /*
   * The case that tells the rule apart, found by mutation in #673: in the test above the
   * form's own field is the last one before the password either way. With no username
   * field in the form, looking outside it would write the email into the search box.
   */
  it('leaves a search box outside the form alone when the form has no username field', () => {
    field('<input id="search" type="text">')
    field('<form><input id="pass" type="password"></form>')
    layout({})

    expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('password-only')
    expect(value('search')).toBe('')
  })

  /*
   * The function runs in the page and cannot import hostOf, so it repeats its one line.
   * This is what keeps the copy from drifting: the popup offers by hostOf, and the page
   * must accept exactly what the popup offered.
   */
  it('normalises the host exactly as the vault does', () => {
    for (const url of ['https://www.github.com/', 'https://github.com/', 'https://dev.github.com/', 'https://wwwx.github.com/']) {
      field('<form><input id="u"><input id="p" type="password"></form>')
      layout({})
      expect(fillInPage('a', 'b', hostOf(url), page(url))).toBe('filled')
      document.body.replaceChildren()
    }
  })
})
