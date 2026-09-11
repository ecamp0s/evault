import type { HistoryEntry, ItemContent } from '@/lib/vault/types'

/**
 * The password history of an entry, and every change that can be made to it.
 *
 * ONE MODULE, BECAUSE THERE ARE TWO WRITERS AND THEY HAD ALREADY DRIFTED APART. `toContent`
 * writes a retired password when its owner rotates one, and `mergeItems` writes a
 * candidate when two managers disagree (`ADR-022` §4 admits it as the second door). Each
 * had its own cap, and they disagreed: the merge kept the undecided candidates, while the
 * rotation cut blindly from the end — so rotating the password of an entry holding one
 * unconfirmed candidate and two retired passwords would drop the candidate, and the mark
 * of #622 would go off without anybody deciding anything. That is exactly what #621 says
 * must not happen. One cap, used by both, is what makes it impossible.
 *
 * Everything here is pure: it takes content and returns content, and the screen decides
 * when to write it.
 */

/**
 * How many previous passwords an entry keeps. `ADR-018` §2.2.
 *
 * THREE, and the number admits discussion but the mechanics do not: it is the depth that
 * covers changing a password, having it rejected and changing it again, without turning
 * the entry into an archive. Without a cap the cost is invisible and grows with use —
 * every rotation fattens the blob that gets encrypted, decrypted and sent whole on every
 * edit.
 *
 * NO EXPIRY BY TIME, and that is not an omission: inside the blob no clock runs. The
 * server cannot read it, so nothing can prune an old entry by its date — a time policy
 * could only ever apply when the client rewrites the item, which is exactly when the cap
 * by number is already acting.
 *
 * The tests of this cap are written with concrete numbers and NOT against this constant,
 * which `ADR-018` §4 asked for by name: Iteration 13 let nineteen tests through that were
 * built from `SHORT_BELOW` and moved with it. Moving the three has to break tests.
 */
export const MAX_HISTORY = 3

/**
 * A history brought back within the cap, keeping its order.
 *
 * WHAT GOES FIRST IS WHAT IS ALREADY DECIDED, which is `ADR-022` §2.7 and now applies to
 * both writers: a retired password is worth less than a candidate that may still be the
 * good one. So the oldest RETIRED entry is dropped first, and an undecided one only when
 * nothing retired is left.
 *
 * THE EDGE THIS LEAVES, said rather than hidden: an entry with three undecided candidates
 * whose owner then types a fourth password loses the one it just replaced, because four
 * passwords do not fit in three places and the rule protects the candidates. Over the
 * real exports it does not occur — no group brings more than three different passwords,
 * so no entry ends up with more than two candidates (#610) — and resolving the candidates
 * first, which is what the screen asks for, avoids it entirely.
 *
 * The order is kept and not re-sorted: newest first is the field's contract (`types.ts`),
 * and the cap chooses what to drop, not how to show what stays.
 */
export function capHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const kept = [...entries]

  while (kept.length > MAX_HISTORY) {
    const lastRetired = kept.findLastIndex((one) => one.origin !== 'import')

    kept.splice(lastRetired === -1 ? kept.length - 1 : lastRetired, 1)
  }

  return kept
}

/**
 * Whether an entry has more than one known password and nobody's word on which is current.
 *
 * It is the mark the screen shows and the audit counts (#622), and it is computed rather
 * than stored: a flag kept next to the history could disagree with it, and then the mark
 * would say something the history does not.
 */
export function hasUnconfirmed(content: ItemContent): boolean {
  return content.history?.some((one) => one.origin === 'import') ?? false
}

/** The content with a new history, removing the key when nothing is left in it. */
function withHistory(content: ItemContent, history: HistoryEntry[]): ItemContent {
  const next: ItemContent = { ...content }

  /*
   * OMITTED WHEN EMPTY, never `[]`: `FOUNDATION.md` §2's contract for `favourite` and
   * `tags`, applied here because forgetting the last entry must not leave a key that says
   * «none» inside the blob.
   */
  if (history.length > 0) next.history = history
  else delete next.history

  return next
}

/**
 * Every candidate becomes a retired password: somebody has said which one is current.
 *
 * `rotation` is the right word for them from here on, and it is the owner's decision that
 * makes it right — not the date and not the manager they came from. `date` is left alone:
 * it says when each one entered the history, and that is still true.
 */
function settled(history: HistoryEntry[]): HistoryEntry[] {
  return history.map((one) =>
    one.origin === 'import' ? { ...one, origin: 'rotation' as const } : one,
  )
}

/**
 * «Esta es la buena», said of the password the entry already carries.
 *
 * Nothing moves: the current password stays and the candidates stay too, as retired ones.
 * Confirming is a statement about which is current, not an order to delete the others —
 * forgetting them is its own gesture, with its own confirmation.
 */
export function confirmCurrent(content: ItemContent): ItemContent {
  return withHistory(content, settled(content.history ?? []))
}

/**
 * «Esta es la buena», said of a password in the history.
 *
 * IT IS A SWAP AND NOTHING IS DELETED, which is the whole reason this field exists instead
 * of discarding the losing password: whoever chooses wrong has to be able to come back,
 * and they can — the password that was current goes into the history like any other
 * retired one, and choosing it again undoes this.
 *
 * And it settles every candidate, not only the chosen one: saying which password is
 * current is saying the others are not.
 */
export function chooseFromHistory(content: ItemContent, index: number): ItemContent {
  const history = content.history ?? []
  const chosen = history[index]

  if (!chosen) return content

  const rest = settled(history.filter((_, position) => position !== index))
  const retired: HistoryEntry[] = content.password
    ? [{ password: content.password, date: new Date().toISOString(), origin: 'rotation' }]
    : []

  return withHistory({ ...content, password: chosen.password }, capHistory([...retired, ...rest]))
}

/**
 * Forgets one password from the history. `ADR-018` §2.2, the per-entry half.
 *
 * FORGETTING A CANDIDATE CAN TURN THE MARK OFF, and that does not break #621's rule that
 * only an explicit gesture does: this is one, with its own confirmation on screen. What it
 * says is stronger than «this is the good one» — it says the other one should not even be
 * kept — so it is the destructive gesture, and the screen treats it as one.
 */
export function forgetHistoryEntry(content: ItemContent, index: number): ItemContent {
  return withHistory(
    content,
    (content.history ?? []).filter((_, position) => position !== index),
  )
}

/**
 * Forgets the whole history of one entry. `ADR-018` §2.2.
 *
 * It exists because without it the history would be irrevocable, which `ADR-018` names as
 * the defect it was written to correct: a vault that keeps retired passwords and offers no
 * way to let go of them only ever grows.
 */
export function forgetHistory(content: ItemContent): ItemContent {
  return withHistory(content, [])
}
