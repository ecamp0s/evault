import { hostOf } from '@/lib/vault/host'
import { isUnreadable } from '@/lib/vault/payload'
import { filterItems } from '@/lib/vault/search'
import type { Item } from '@/lib/vault/types'

/**
 * Which entries the popup shows, and in what order (#672).
 *
 * LOGINS ONLY. A card or a secure note has nothing to copy into a login form, and a card
 * number is exactly the secret that should not be one click away in a toolbar. They stay
 * in the web, where ADR-020 put the screens that show them.
 */

/**
 * How many rows the popup paints at most.
 *
 * A CAP AND NOT A VIRTUALISED LIST, and that is what keeps the popup free of a UI
 * framework. The web virtualises because it shows the whole vault; the popup never does:
 * it shows the site that is open, or what was searched for. Fifty rows is more than a
 * popup has room for and far below what costs anything to paint, and when a search
 * matches more, the popup says so — typing one more letter is the answer, not scrolling
 * through 669.
 */
export const MAX_ROWS = 50

/** The hosts that count as «this site» for an entry, with the rule of ADR-022. */
function siteOf(item: Item): string {
  return item.content.url?.trim() ? hostOf(item.content.url) : ''
}

export function isLogin(item: Item): boolean {
  return !isUnreadable(item.content) && item.content.type === undefined
}

export interface Selection {
  rows: Item[]
  /** How many matched in total, which is more than `rows` when the cap cut it. */
  total: number
  /** How many of the rows belong to the site that is open. */
  onThisSite: number
}

/**
 * The rows for what is typed and the site that is open.
 *
 * NOTHING TYPED shows only the entries of the open site. The whole vault is not a useful
 * default in a popup, and painting it would be exactly what the cap exists to avoid.
 *
 * SOMETHING TYPED searches the whole vault with the web's own search —the same fields,
 * the same accents, the same «every word»— and puts the open site's matches first. The
 * site is compared host to host, `www.` aside, and nothing looser: `dev.` and production
 * are different credentials on purpose (ADR-022 §2.1), and offering one on the other is
 * how a password ends up typed into the wrong environment.
 */
export function select(items: Item[], query: string, siteHost: string | null): Selection {
  const logins = items.filter(isLogin)
  const onSite = (item: Item) => siteHost !== null && siteHost !== '' && siteOf(item) === siteHost

  const matches = query.trim()
    ? filterItems(logins, query)
    : logins.filter(onSite)

  const ordered = [...matches.filter(onSite), ...matches.filter((item) => !onSite(item))]
  const rows = ordered.slice(0, MAX_ROWS)

  return { rows, total: matches.length, onThisSite: rows.filter(onSite).length }
}

/**
 * The host of the tab that is open, or null when it is not a site an entry could be for.
 *
 * `chrome://`, `about:` and the extension's own pages have no host a vault entry would
 * carry, and matching them by accident — an entry whose «url» is the text «newtab» — would
 * put a password first on a page that is not a login.
 */
export function siteHostOf(tabUrl: string | undefined): string | null {
  if (!tabUrl) return null

  try {
    const url = new URL(tabUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? hostOf(url.href) : null
  } catch {
    return null
  }
}
