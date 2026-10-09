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
  const win = { location: { protocol, hostname }, innerWidth: 1024, innerHeight: 768, document, HTMLInputElement, getComputedStyle: (e: Element) => getComputedStyle(e) } as unknown as PageWindow
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
      /*
       * The visible field beside it names itself the username's —its id says so— and goes
       * in alone since #773, as on the first step of a two-step login. The password never.
       */
      it(`does not fill a password field ${name}`, () => {
        field('<form><input id="user"><input id="pass" type="password"></form>')
        layout({ pass: box })

        expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('username-only')
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
    field('<form><input id="user" disabled><input id="pass" type="password" readonly></form>')
    layout({})

    expect(fillInPage('ada', 's3cr3t', 'example.com', page())).toBe('no-password-field')
    expect(value('user')).toBe('')
    expect(value('pass')).toBe('')
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
   * A LOGIN IN TWO STEPS (#768): the first page asks only for the username. Found filling
   * a real site from the Firefox of #754, where the popup refused the whole page.
   */
  describe('the first step of a two-step login', () => {
    /*
     * Shein's first step as #768 measured it: the login field declares nothing and has the
     * focus, and the newsletter in the footer is the one that says `type="email"`.
     */
    it('fills the field that has the focus, and not the newsletter that says type="email"', () => {
      field('<div><input id="user" type="text" autocomplete="off" aria-label="Email Address:"><button>Continuar</button></div>')
      field('<footer><input id="newsletter" type="email" aria-label="Your Email Address"><button>Subscribe</button></footer>')
      layout({})
      document.getElementById('user')!.focus()

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('user')).toBe('ada@example.com')
      expect(value('newsletter')).toBe('')
    })

    it('does not take a bare type="email" for the username when nothing points at it', () => {
      field('<footer><input id="newsletter" type="email"></footer>')
      layout({})

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('newsletter')).toBe('')
    })

    it.each([
      ['autocomplete="username"', '<input id="user" type="text" autocomplete="username">'],
      ['autocomplete="email"', '<input id="user" type="email" autocomplete="email">'],
      ['autocomplete with more than one token', '<input id="user" autocomplete="username webauthn">'],
    ])('without a focused field, fills one declared with %s', (_, html) => {
      field(`<form>${html}<button>Siguiente</button></form>`)
      layout({})

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('user')).toBe('ada@example.com')
    })

    /*
     * #773: the same pages once something else took the focus. Closing gravatar.com's cookie
     * banner leaves it on <body>, measured on its login at wordpress.com, and shein.com's
     * field names itself only through its label.
     */
    it.each([
      ['a name, as wordpress.com does', '<input id="user" type="text" name="usernameOrEmail">'],
      ['an aria-label, as shein.com does', '<input id="user" type="text" autocomplete="off" aria-label="Email Address:">'],
      ['a placeholder', '<input id="user" type="text" placeholder="Correo electrónico">'],
      ['a label', '<label for="user">Usuario</label><input id="user" type="text">'],
    ])('without the focus, fills the first field on screen that names itself the username by %s', (_, html) => {
      field(`<div>${html}<button>Continuar</button></div>`)
      layout({})

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('user')).toBe('ada@example.com')
    })

    it('without the focus, fills the login field and not the newsletter below it that also says email', () => {
      field('<div><input id="user" type="text" aria-label="Email Address:"><button>Continuar</button></div>')
      field('<div><input id="newsletter" type="email" aria-label="Your Email Address"><button>Subscribe</button></div>')
      layout({ newsletter: { top: 1008 } })

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('user')).toBe('ada@example.com')
      expect(value('newsletter')).toBe('')
    })

    it('fills nothing when the first field that names itself is scrolled out of sight, rather than the next one', () => {
      field('<div><input id="user" type="text" aria-label="Email Address:"><button>Continuar</button></div>')
      field('<div><input id="later" type="text" placeholder="Your email"></div>')
      layout({ user: { top: -500 } })

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('user')).toBe('')
      expect(value('later')).toBe('')
    })

    it('fills nothing when the field that names itself is still below the window, where nobody sees it written', () => {
      field('<div><input id="user" type="text" name="usernameOrEmail"></div>')
      layout({ user: { top: 900 } })

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('user')).toBe('')
    })

    it.each([
      ['inside a footer', '<footer><input id="box" type="email" aria-label="Your Email Address"></footer>'],
      ['inside role="contentinfo"', '<div role="contentinfo"><input id="box" type="email" placeholder="Email"></div>'],
      ['that says newsletter', '<input id="box" type="email" name="newsletter-email">'],
      ['that says it subscribes', '<input id="box" type="email" placeholder="Email to subscribe">'],
      ['that says boletín', '<input id="box" type="email" aria-label="Correo para el boletín">'],
    ])('never takes for the username a field on screen %s', (_, html) => {
      field(html)
      layout({})

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('box')).toBe('')
    })

    it('prefers the focused field to a declared one elsewhere', () => {
      field('<input id="focused" type="text">')
      field('<input id="declared" autocomplete="username">')
      layout({})
      document.getElementById('focused')!.focus()

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('focused')).toBe('ada@example.com')
      expect(value('declared')).toBe('')
    })

    it.each([
      ['type="search"', '<input id="box" type="search">'],
      ['a name of q', '<input id="box" name="q">'],
      ['a label that says search', '<input id="box" aria-label="Search products">'],
      ['a placeholder that says buscar', '<input id="box" placeholder="Buscar en la tienda">'],
      ['a role="search" around it', '<div role="search"><input id="box" type="text"></div>'],
    ])('never writes into a search box, even focused: %s', (_, html) => {
      field(html)
      layout({})
      document.getElementById('box')!.focus()

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('box')).toBe('')
    })

    it('never writes into a lone field nothing points at', () => {
      field('<input id="lonely" type="text">')
      layout({})

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('lonely')).toBe('')
    })

    it('does not fill a focused username field the page hid', () => {
      field('<input id="user" type="text">')
      layout({ user: { visible: false } })
      document.getElementById('user')!.focus()

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('user')).toBe('')
    })

    it('fills the visible username even with a hidden password field beside it, as some of these pages keep', () => {
      field('<form><input id="user" autocomplete="username"><input id="pass" type="password"></form>')
      layout({ pass: { visible: false } })

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', page())).toBe('username-only')
      expect(value('user')).toBe('ada@example.com')
      expect(value('pass')).toBe('')
    })

    it('fills nothing for an entry with no username', () => {
      field('<input id="user" autocomplete="username">')
      layout({})

      expect(fillInPage('', 's3cr3t', 'example.com', page())).toBe('no-password-field')
      expect(value('user')).toBe('')
    })

    /*
     * The barriers come before any field is looked at, so they hold on this path too —
     * and each is said here, because a later reordering would move this path ahead of them.
     */
    it.each([
      ['another frame', () => page('https://example.com/login', {}), 'not-top-frame'],
      ['another host', () => page('https://example.com.attacker.net/login'), 'other-site'],
      ['plain http', () => page('http://example.com/login'), 'insecure'],
    ])('refuses %s here too', (_, where, outcome) => {
      field('<input id="user" type="text">')
      layout({})
      document.getElementById('user')!.focus()

      expect(fillInPage('ada@example.com', 's3cr3t', 'example.com', where())).toBe(outcome)
      expect(value('user')).toBe('')
    })
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
