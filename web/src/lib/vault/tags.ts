import type { Item } from '@/lib/vault/types'
import { normalize } from '@/lib/vault/search'

/**
 * The tags of a vault, worked out in the client because nowhere else can.
 *
 * There is no endpoint that returns them and there cannot be: they live inside the
 * encrypted blob, so the only place where they exist as text is here, after decrypting.
 * It is the same reason searching and sorting are client-side, and it is worth saying
 * once more where somebody might otherwise reach for the server.
 */

/**
 * The form of a tag used for comparing, never for showing.
 *
 * «Trabajo» and «trabajo» must not become two tags, and neither must «Café» and «cafe»
 * — somebody typing in a hurry on a keyboard without the accent means the same thing.
 * `normalize()` from `search.ts` already lowercases and strips the marks, and reusing
 * it is right HERE, unlike in sorting: this is a comparison, which is exactly what that
 * function was written for.
 *
 * WHAT THE USER TYPED IS WHAT GETS STORED AND SHOWN. This form is only ever used as a
 * key: rewriting «Café» as «cafe» in the entry would be correcting the user's writing
 * over a matter of internal bookkeeping.
 */
export function tagKey(tag: string): string {
  return normalize(tag.trim())
}

/**
 * Every tag in the vault, once each, in the order a person reads them.
 *
 * The first spelling seen wins, which is arbitrary and has to be: with «Trabajo» on one
 * entry and «trabajo» on another there is no right answer, only a stable one. Stability
 * is what matters — a list that reorders itself between renders is worse than one that
 * picked the other capitalisation.
 */
export function tagsInVault(items: Item[]): string[] {
  const seen = new Map<string, string>()

  for (const item of items) {
    for (const tag of item.content.etiquetas ?? []) {
      const key = tagKey(tag)

      if (key && !seen.has(key)) seen.set(key, tag.trim())
    }
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/**
 * Whether the entry carries a tag, comparing by key and not by what was typed.
 */
export function hasTag(item: Item, tag: string): boolean {
  const key = tagKey(tag)

  return (item.content.etiquetas ?? []).some((one) => tagKey(one) === key)
}

/**
 * Adds a tag to a list, doing nothing if it is already there in any spelling.
 *
 * Returns the same array when there is nothing to add, so that a form does not mark
 * itself dirty for a keystroke that changed nothing.
 */
export function addTag(tags: string[], tag: string): string[] {
  const clean = tag.trim()
  const key = tagKey(clean)

  if (!key) return tags
  if (tags.some((one) => tagKey(one) === key)) return tags

  return [...tags, clean]
}

/** Removes a tag by key, so that removing «Trabajo» also removes «trabajo». */
export function removeTag(tags: string[], tag: string): string[] {
  const key = tagKey(tag)

  return tags.filter((one) => tagKey(one) !== key)
}
