/**
 * Fills a login form in the page. Runs INSIDE the page, injected with
 * `chrome.scripting.executeScript` at the moment of the gesture and at no other (#673).
 *
 * SELF-CONTAINED ON PURPOSE: Chrome serialises this function's source and runs it in the
 * page, so it can use nothing from outside its own body — no imports, no helpers of this
 * module. That is why the host normalisation below repeats `hostOf`'s one line instead of
 * importing it, and why a test compares the two.
 *
 * IT CHECKS AGAIN, IN THE PAGE, WHAT THE POPUP ALREADY CHECKED. The popup decided to offer
 * this entry for the tab it saw when it opened; between that moment and the click the tab
 * can navigate. Only here is the page that will receive the password known for certain,
 * so the rules of ADR-023 §2.4 are enforced here and not only there:
 *
 * - Only the top frame. `executeScript` without `allFrames` already targets it alone; the
 *   check is the second barrier, because frames are how autofill gets attacked.
 * - Only the entry's host, compared the way the vault compares hosts: exactly, `www.`
 *   aside. `accounts.example.com` is not filled on `example.com.attacker.net`, and `dev.`
 *   is not production.
 * - Only over https, or http on localhost. A password typed into a plain http page travels
 *   in the clear, and no convenience is worth being the one who put it there.
 * - Only visible, enabled fields. An invisible form is how a page collects a filled
 *   password nobody saw being filled.
 *
 * It never submits the form: filling is the gesture the person asked for, sending is theirs.
 *
 * AND IT KNOWS LOGINS IN TWO STEPS (#768, #773): a first page that asks only for the username
 * and a second one for the password. On the first there is no password to anchor anything to,
 * so the username field is not guessed by position — it has to declare itself one.
 */

export type FillOutcome =
  | 'filled'
  /** The password went in and no username field was found for the username. */
  | 'password-only'
  /** The first step of a two-step login: only the username was asked, and it went in (#768). */
  | 'username-only'
  /** Neither a password field nor one that declares itself the username's. */
  | 'no-password-field'
  | 'other-site'
  | 'insecure'
  | 'not-top-frame'

/** The part of a window this function reads. A parameter only so tests can hand one over. */
export interface PageWindow {
  top: unknown
  location: { protocol: string; hostname: string }
  innerWidth: number
  innerHeight: number
  document: Document
  HTMLInputElement: typeof HTMLInputElement
  getComputedStyle: (element: Element) => { overflowX: string; overflowY: string }
}

export function fillInPage(
  username: string,
  password: string,
  expectedHost: string,
  win: PageWindow = window as unknown as PageWindow,
): FillOutcome {
  if (win.top !== win) return 'not-top-frame'

  const { protocol, hostname } = win.location
  const local = hostname === 'localhost' || hostname.endsWith('.localhost')
  if (protocol !== 'https:' && !(protocol === 'http:' && local)) return 'insecure'

  // hostOf in web/src/lib/vault/host.ts, repeated because this runs in the page.
  if (hostname.replace(/^www\./, '') !== expectedHost) return 'other-site'

  // Rendered, enabled and writable: what a field needs before its box is even looked at.
  const shown = (input: HTMLInputElement) =>
    !input.disabled &&
    !input.readOnly &&
    (typeof input.checkVisibility === 'function'
      ? input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true)

  const usable = (input: HTMLInputElement) => {
    if (!shown(input)) return false

    /*
     * WHAT IS LEFT OF THE FIELD ONCE EVERY ANCESTOR THAT CLIPS HAS CLIPPED IT.
     *
     * Found in the Chromium check of #673, not in these tests: a field inside a 0×0 box
     * with `overflow: hidden` measures 200×24 and `checkVisibility` calls it visible,
     * while nobody can see a pixel of it — and it was filled. So the field's box is
     * intersected with the box of each ancestor whose overflow is not `visible`.
     *
     * Then tiny, or pushed out above or to the left of the page: the other ways of hiding
     * a field that checkVisibility does not see. What this does not catch, and is said so:
     * a field covered by another element, or clipped by `clip-path`.
     */
    let { left, top, right, bottom } = input.getBoundingClientRect()
    for (let node = input.parentElement; node; node = node.parentElement) {
      const { overflowX, overflowY } = win.getComputedStyle(node)
      if (overflowX === 'visible' && overflowY === 'visible') continue

      const clip = node.getBoundingClientRect()
      if (overflowX !== 'visible') {
        left = Math.max(left, clip.left)
        right = Math.min(right, clip.right)
      }
      if (overflowY !== 'visible') {
        top = Math.max(top, clip.top)
        bottom = Math.min(bottom, clip.bottom)
      }
    }

    return right - left >= 2 && bottom - top >= 2 && right > 0 && bottom > 0
  }

  // The native setter and the events, because frameworks track the value on the node and
  // ignore a plain assignment: the field would look filled and submit empty.
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set
  const fill = (input: HTMLInputElement, value: string) => {
    input.focus()
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // A search box by any of the names it goes by. Inside the function, like everything here.
  const isSearch = (input: HTMLInputElement) =>
    input.type === 'search' ||
    input.getAttribute('role') === 'searchbox' ||
    input.closest('[role="search"]') !== null ||
    input.name === 'q' ||
    /search|buscar|búsqueda|query/i.test(
      [input.name, input.id, input.getAttribute('aria-label') ?? '', input.placeholder].join(' '),
    )

  const inputs = Array.from(win.document.querySelectorAll('input')).filter(usable)
  const passwordField = inputs.find((input) => input.type === 'password')

  if (!passwordField) {
    /*
     * THE FIRST STEP OF A TWO-STEP LOGIN, or a page with nothing to fill. With no password
     * beside it the username field cannot be told by its position, and a lone text field
     * could be a search box or a newsletter sign-up: writing an address there is leaking
     * it. Measured on a real one in #768 —the first step of shein.com—, whose login field
     * declares nothing (`type="text"`, `autocomplete="off"`) while the newsletter in its
     * footer is a `type="email"`. So the field is the one the page or the person points at:
     *
     * 1. THE FOCUSED ONE. A two-step login puts the cursor in its field on load, and a
     *    person who clicks into a field has chosen it. It is also the one they are looking
     *    at, so nothing is written somewhere they cannot see.
     * 2. Otherwise one that DECLARES itself the username's, with the `autocomplete` tokens
     *    browsers' own autofill reads: username or email.
     *
     * 3. Otherwise THE FIRST FIELD THAT NAMES ITSELF the username's —by its name, id, label
     *    or placeholder— and only IF IT IS ON SCREEN (#773). The focus is not enough on its
     *    own: measured on wordpress.com, the login of gravatar.com, closing the cookie banner
     *    moves it to <body>, and every real page has one. Neither that field
     *    (`name="usernameOrEmail"`) nor shein.com's (`aria-label="Email Address:"`) carries
     *    `autocomplete`, while both name themselves.
     *
     *    THE FIRST, AND NOT THE ONLY ONE: shein.com's newsletter names itself an email
     *    address too, and a login form comes before its page's footer. AND ON SCREEN, so a
     *    page scrolled down to that footer gets nothing instead of the next field down — the
     *    same reason the focused field is trusted: it is the one the person is looking at.
     *    So «the first» is looked for among the fields the page RENDERS and not among
     *    `inputs`: `usable` drops a field scrolled out above the page, and the first
     *    usable one would then be exactly that next field down.
     *    Fields inside a footer, and those that say they subscribe to something, are not
     *    candidates at all: shein.com's newsletter is both.
     *
     * And never a search box, focused or not. `type="email"` alone is not enough any more:
     * it is exactly what a newsletter field carries. A field a page hid stays out, as
     * everywhere: `inputs` is only the usable ones.
     */
    const textual = (input: HTMLInputElement) => ['text', 'email', 'tel'].includes(input.type) && !isSearch(input)
    const focused = inputs.find((input) => input === win.document.activeElement && textual(input))
    const declared = inputs.find((input) => {
      const tokens = (input.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/)
      return textual(input) && (tokens.includes('username') || tokens.includes('email'))
    })

    const words = (input: HTMLInputElement) =>
      [
        input.name,
        input.id,
        input.getAttribute('aria-label') ?? '',
        input.placeholder,
        ...Array.from(input.labels ?? [], (label) => label.textContent ?? ''),
      ].join(' ')
    const named = Array.from(win.document.querySelectorAll('input')).find(
      (input) =>
        shown(input) &&
        textual(input) &&
        input.closest('footer, [role="contentinfo"]') === null &&
        !/newsletter|subscri|suscri|bolet[ií]n/i.test(words(input)) &&
        /user|e-?mail|login|identifier|alias|usuario|correo/i.test(words(input)),
    )
    const onScreen = (input: HTMLInputElement) => {
      const { left, top, right, bottom } = input.getBoundingClientRect()
      return right > 0 && bottom > 0 && left < win.innerWidth && top < win.innerHeight
    }

    const target = focused ?? declared ?? (named && usable(named) && onScreen(named) ? named : undefined)
    if (!target || username === '') return 'no-password-field'

    fill(target, username)
    return 'username-only'
  }

  // The username field is the last text-like field before the password, in its form when
  // it has one: that is where every login form puts it.
  const textLike = new Set(['text', 'email', 'tel', ''])
  const usernameField = inputs
    .filter((input) => textLike.has(input.getAttribute('type')?.toLowerCase() ?? ''))
    .filter((input) => !passwordField.form || input.form === passwordField.form)
    .filter((input) => input.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING)
    .at(-1)

  const fillUsername = username !== '' && usernameField !== undefined
  if (fillUsername) fill(usernameField, username)
  fill(passwordField, password)

  return username !== '' && !fillUsername ? 'password-only' : 'filled'
}
