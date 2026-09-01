import type { Item } from '@/lib/vault/types'

/**
 * What is wrong with the passwords in a vault, worked out here because nowhere else can.
 *
 * THE SERVER CANNOT DO THIS, and not as an implementation limit: to know that four
 * entries share a password you need the four decrypted, and that only ever happens
 * inside the browser of whoever holds the key. It is `ADR-001` producing a feature
 * instead of a restriction, which is the same reason searching, sorting and the list of
 * tags are all client-side.
 *
 * IT DOES NOT CLAIM TO MEASURE STRENGTH, and that is the decision that shapes the rest.
 * Scoring a human-chosen password needs a dictionary —«Password123!» is long, mixed and
 * worthless— and a dictionary means a dependency in the client that serves the
 * JavaScript that encrypts the passwords, which `ADR-001` warns about. Computing naive
 * entropy instead would be worse than not scoring: it would hand out a high number for
 * exactly those passwords, and a wrong reassurance is more expensive than no reassurance.
 *
 * So it reports three things that can be seen without guessing at anything, and says
 * only what it can see.
 */

/** What can be said about a password without a dictionary and without pretending. */
export type Finding =
  /** The same password is in two or more entries. */
  | 'repeated'
  /** Fewer characters than anything current would ask for. */
  | 'short'
  /** Every character comes from one class: only letters, or only digits. */
  | 'weak'

/**
 * Below this many characters an entry is reported as short.
 *
 * THE NUMBER IS PROVISIONAL UNTIL IT IS MEASURED AGAINST THE REAL VAULT, and #421 says
 * so in as many words: a threshold that flags 300 of 370 entries is wrong however good
 * the argument behind it. Twelve is where current guidance sits and where this project's
 * own generator already stands —its default is twenty, its floor eight— but what decides
 * is what it marks over passwords nobody chose for a test.
 *
 * The reason to care is #62 turned into a warning: an audit that flags almost everything
 * gets ignored entirely, and the entries that really needed changing go with it.
 */
export const SHORT_BELOW = 12

/** An entry and everything the audit has to say about it. */
export interface AuditedItem {
  item: Item
  findings: Finding[]
  /** How many entries share this password, when it is repeated. Never below two. */
  sharedWith?: number
}

/** The whole audit, ready for a screen to read. */
export interface Audit {
  /** Only the entries with something to say, in the order they came in. */
  flagged: AuditedItem[]
  /** How many entries carry each finding, for the headline. */
  counts: Record<Finding, number>
  /** How many entries had a password to look at, which is what the counts are over. */
  withPassword: number
}

/**
 * Audits a vault's passwords.
 *
 * ONE PASS TO GROUP AND ONE TO REPORT, over a Map keyed by the password: comparing every
 * entry against every other would be 68.000 comparisons on the real vault of 370, and
 * this screen has to open as fast as the list does. The Iteration 11 measurements are
 * the standard it has to keep.
 *
 * ENTRIES WITHOUT A PASSWORD ARE NOT AUDITED AND ARE NOT COUNTED. A card number or a
 * note kept in the vault has nothing to say here, and counting it would dilute every
 * proportion the screen reports.
 */
export function auditPasswords(items: Item[]): Audit {
  const byPassword = new Map<string, number>()

  for (const item of items) {
    const password = item.content.password

    if (!password) continue

    byPassword.set(password, (byPassword.get(password) ?? 0) + 1)
  }

  const flagged: AuditedItem[] = []
  const counts: Record<Finding, number> = { repeated: 0, short: 0, weak: 0 }
  let withPassword = 0

  for (const item of items) {
    const password = item.content.password

    if (!password) continue

    withPassword += 1

    const shared = byPassword.get(password) ?? 1
    const findings: Finding[] = []

    if (shared > 1) findings.push('repeated')
    if (password.length < SHORT_BELOW) findings.push('short')
    if (isOneClass(password)) findings.push('weak')

    if (findings.length === 0) continue

    for (const finding of findings) counts[finding] += 1

    flagged.push(shared > 1 ? { item, findings, sharedWith: shared } : { item, findings })
  }

  return { flagged, counts, withPassword }
}

/**
 * Whether every character of a password comes from a single class.
 *
 * IT IS THE ONE STATEMENT ABOUT VARIETY THAT NEEDS NO DICTIONARY. «solobajitas» and
 * «84726194» are weak whatever their length, and saying so needs no guess about what a
 * person was thinking. Anything finer —that «Verano2024!» is weak despite having four
 * classes— cannot be said without one, and this module does not pretend it can.
 *
 * The classes are the generator's, minus its exclusions: it leaves out `l`, `I`, `1`,
 * `O` and `0` to avoid confusion when reading a password aloud, and a password being
 * audited was not necessarily generated here.
 */
function isOneClass(password: string): boolean {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((pattern) =>
    pattern.test(password),
  )

  return classes.length <= 1
}

/**
 * The passwords shared by more than one entry, grouped, most shared first.
 *
 * IT RETURNS THE ENTRIES, PASSWORD INCLUDED, and saying so plainly matters more than it
 * looks. A first version of this comment claimed the opposite — that the password never
 * came out — and it was false: an `Item` carries its content, and the test written to
 * prove the claim caught it.
 *
 * Hiding it here would have been theatre anyway. The whole vault is decrypted in memory
 * by the time anything gets audited, so a function withholding one field protects
 * nothing; and the screen needs the entries to name them and to open them for editing.
 *
 * THE GUARANTEE THAT MATTERS IS THAT THE SCREEN DOES NOT PAINT IT — «these four share a
 * password», never which one — and that can only be held where the painting happens.
 * It belongs to #422 and is enforced there.
 */
export function repeatedGroups(items: Item[]): { items: Item[] }[] {
  const groups = new Map<string, Item[]>()

  for (const item of items) {
    const password = item.content.password

    if (!password) continue

    groups.set(password, [...(groups.get(password) ?? []), item])
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((group) => ({ items: group }))
}
