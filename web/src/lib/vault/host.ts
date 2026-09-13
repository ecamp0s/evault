/**
 * The host an address belongs to, as the rest of the vault compares hosts.
 *
 * ONE PLACE, AND TWO CALLERS THAT MUST AGREE. The import uses it to name an entry that
 * came without a name and, through that, to decide which entries are the same account
 * (ADR-022 §2.1). The browser extension uses it to put first the entries of the site that
 * is open, and to refuse to fill a form on a host that is not the entry's (ADR-023 §2.4).
 * If the two normalised differently, an entry the import grouped with a site would not
 * be offered on that site — or, worse, would be filled on one it does not belong to.
 *
 * It lives apart from import.ts because that file pulls the item schema and zod with it,
 * and the extension needs this function and nothing else.
 */

/**
 * The host without `www.`, which is what the other managers use and what the person
 * recognises: they know they have an account at github.com, not at
 * `https://github.com/login?return_to=%2F`.
 *
 * IT FALLS BACK TO THE RAW TEXT INSTEAD OF GIVING UP, and for the import that is the
 * decision that matters: a URL that does not parse is still better as a name than
 * dropping the entry. Losing a password because its address was odd is the worst thing
 * the import could do. A caller that needs a real host — filling a form — has to check
 * for itself that it got one.
 */
export function hostOf(url: string): string {
  const raw = url.trim()

  if (!raw) return ''

  // Firefox writes full URLs, but a file edited by hand may not have the scheme, and
  // `new URL` needs one. Trying twice is cheaper than a regular expression for hosts.
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      const host = new URL(candidate).hostname.replace(/^www\./, '')

      if (host) return host
    } catch {
      // Not a URL under this reading; the next one, or the raw text.
    }
  }

  return raw
}
