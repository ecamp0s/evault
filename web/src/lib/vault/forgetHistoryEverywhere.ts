import { forgetHistory, hasUnconfirmed } from './history'
import type { Item, ItemContent } from './types'

/**
 * Forgetting the password history of the WHOLE vault. `ADR-018` §2.2, the other half.
 *
 * WHY IT IS NOT THE SAME GESTURE REPEATED — #646. The per-entry one exists since #621,
 * and over a vault of 669 entries it is not an option anybody uses: `ADR-018` §5.1 names
 * explicit forgetting as one of the two mitigations of keeping retired passwords at all,
 * and a mitigation that has to be applied one entry at a time is a mitigation on paper.
 *
 * IT IS THE CLIENT THAT DOES IT BECAUSE ONLY THE CLIENT CAN: the server does not know
 * which entries carry a history, because it cannot read any of them (`ADR-001`). So it is
 * as many writes as entries with history, one at a time, counting — the shape of the
 * import, and for the same reason.
 *
 * The planning is pure and the writing is injected, so what this file promises can be
 * tested without a server: that it touches only what has history, and that it says how
 * many it got through when something cuts it halfway.
 */

export interface HistoryAcrossTheVault {
  /** The entries that carry a history. The only ones that get written. */
  entries: Item[]
  /** How many passwords would be forgotten in total, which is what the vault holds extra. */
  passwords: number
  /**
   * The entries whose history holds a candidate nobody has confirmed (`ADR-022`).
   *
   * THEY ARE COUNTED APART BECAUSE FORGETTING THERE IS NOT ONLY FORGETTING: with two
   * passwords and nobody's word on which one works, throwing the other away can be
   * throwing away the good one. The screen warns about these separately rather than
   * refusing them — it is the owner's vault and the owner's call.
   */
  unconfirmed: Item[]
}

export function historyAcrossTheVault(items: Item[]): HistoryAcrossTheVault {
  const entries = items.filter((item) => (item.content.history?.length ?? 0) > 0)

  return {
    entries,
    passwords: entries.reduce((total, item) => total + (item.content.history?.length ?? 0), 0),
    unconfirmed: entries.filter((item) => hasUnconfirmed(item.content)),
  }
}

export interface ForgetProgress {
  /** How many entries were written before it stopped, whether it finished or not. */
  done: number
  /** What stopped it, or nothing when it got through them all. */
  failure?: unknown
}

/**
 * Forgets the history of every entry given, one at a time, and says how far it got.
 *
 * IT DOES NOT THROW ON FAILURE, and that is the point: the count is what the person needs
 * — `ADR-018`'s forgetting is not undoable, so «it failed» without a number leaves them
 * unable to tell whether to run it again over what is left or worry about what went. An
 * exception would carry the reason and lose the count, which is the wrong half.
 *
 * Nothing is rolled back, and nothing could be: each write is a separate request against a
 * server that cannot read what it stores. Stopping early is the safe direction — what was
 * forgotten was going to be forgotten anyway.
 */
export async function forgetHistoryEverywhere(
  entries: Item[],
  write: (item: Item, content: ItemContent) => Promise<unknown>,
  onProgress?: (done: number) => void,
): Promise<ForgetProgress> {
  let done = 0

  for (const item of entries) {
    try {
      await write(item, forgetHistory(item.content))
    } catch (failure) {
      return { done, failure }
    }

    done += 1
    onProgress?.(done)
  }

  return { done }
}
