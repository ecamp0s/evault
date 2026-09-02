import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SORT_ORDER, type SortOrder } from '@/lib/vault/sort'

/**
 * The order the list is shown in, remembered between sessions.
 *
 * It **is** persisted, unlike the token and the vault key, and the difference is not
 * convenience but what each thing is: there is no secret here, only whether somebody
 * prefers to read their entries by name or by how recent they are. Nobody decrypts
 * anything with that. It is the same reasoning as `generatorPreferences.ts`.
 *
 * A store of its own and not state inside the screen: the list unmounts on every lock,
 * and re-picking the order after each unlock would turn a preference into a chore.
 *
 * THE KEY IS IN ENGLISH, like every other persisted one. This comment used to argue the
 * opposite —that a new key in English would leave the browser's storage split across two
 * languages— and #476 replaced the whole family instead, which is the answer that stops
 * the argument recurring.
 *
 * The distinction that comment was missing: «renaming loses what is stored under it» is a
 * reason not to rename a key that ALREADY EXISTS, and says nothing about what to call a
 * new one. It is the same distinction `CLAUDE.md` draws for migration filenames — the
 * applied ones are never renamed, the new ones are written in English.
 */

interface SortPreferenceState {
  order: SortOrder
  setOrder: (order: SortOrder) => void
}

export const useSortPreference = create<SortPreferenceState>()(
  persist(
    (set) => ({
      order: DEFAULT_SORT_ORDER,
      setOrder: (order) => set({ order }),
    }),
    { name: 'evault.sort' },
  ),
)
