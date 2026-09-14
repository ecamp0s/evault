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
 */

export type FillOutcome =
  | 'filled'
  /** The password went in and no username field was found for the username. */
  | 'password-only'
  | 'no-password-field'
  | 'other-site'
  | 'insecure'
  | 'not-top-frame'

/** The part of a window this function reads. A parameter only so tests can hand one over. */
export interface PageWindow {
  top: unknown
  location: { protocol: string; hostname: string }
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

  const usable = (input: HTMLInputElement) => {
    if (input.disabled || input.readOnly) return false

    const shown =
      typeof input.checkVisibility === 'function'
        ? input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : true
    if (!shown) return false

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

  const inputs = Array.from(win.document.querySelectorAll('input')).filter(usable)
  const passwordField = inputs.find((input) => input.type === 'password')
  if (!passwordField) return 'no-password-field'

  // The username field is the last text-like field before the password, in its form when
  // it has one: that is where every login form puts it.
  const textLike = new Set(['text', 'email', 'tel', ''])
  const usernameField = inputs
    .filter((input) => textLike.has(input.getAttribute('type')?.toLowerCase() ?? ''))
    .filter((input) => !passwordField.form || input.form === passwordField.form)
    .filter((input) => input.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING)
    .at(-1)

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

  const fillUsername = username !== '' && usernameField !== undefined
  if (fillUsername) fill(usernameField, username)
  fill(passwordField, password)

  return username !== '' && !fillUsername ? 'password-only' : 'filled'
}
