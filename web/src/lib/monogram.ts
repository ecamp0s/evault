/**
 * The initial and the colour a login with an address shows in the list, instead of the
 * same globe on every row (#791).
 *
 * NOTHING HERE ASKS THE NETWORK, and that is the point rather than a limitation. The usual
 * answer is the site's favicon, and fetching it — from the site itself or from a favicon
 * service — would tell a third party, or every site, which accounts are in this vault: the
 * one thing ADR-001 keeps on this device. So the row is told apart with what it already
 * knows.
 *
 * THE LETTER COMES FROM THE NAME and THE COLOUR FROM THE HOST. The name is what is read
 * right beside it, so «G» next to «GitHub» says something; the host is what two entries of
 * one site share even when they are named differently, so they share a colour.
 */

/*
 * Eight hues a step apart around the colour wheel, each a soft tint behind a light letter:
 * the first palette had emerald next to teal and violet next to indigo, and side by side
 * in the list they read as one colour. ONLY THE DARK THEME, because there is
 * no other: it is fixed in index.html since #696, so light variants would be classes no
 * screen ever shows. The full class names are written out because Tailwind only generates
 * what it finds spelled in the source. Their contrast was measured in a browser over the
 * row's real background, not assumed: see #791.
 */
export const MONOGRAM_COLOURS = [
  'bg-rose-500/15 text-rose-300',
  'bg-orange-500/15 text-orange-300',
  'bg-amber-500/15 text-amber-300',
  'bg-lime-500/15 text-lime-300',
  'bg-cyan-500/15 text-cyan-300',
  'bg-blue-500/15 text-blue-300',
  'bg-violet-500/15 text-violet-300',
  'bg-fuchsia-500/15 text-fuchsia-300',
] as const

export interface Monogram {
  letter: string
  colour: (typeof MONOGRAM_COLOURS)[number]
}

/** FNV-1a: tiny, stable across sessions and browsers, and evenly spread for short strings. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/** The first letter or digit, so «(trabajo) Slack» gets an S and not a bracket. */
function firstLetter(text: string): string | undefined {
  return text.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase('es')
}

export function monogramOf(name: string, host: string): Monogram {
  return {
    letter: firstLetter(name) ?? firstLetter(host) ?? '?',
    colour: MONOGRAM_COLOURS[hash(host.toLowerCase()) % MONOGRAM_COLOURS.length],
  }
}
