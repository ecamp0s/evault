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
 * THE KEY IS IN SPANISH, `evault.orden`, on purpose. It joins `evault.sesion` and
 * `evault.generador`, which are not identifiers but names of things persisted in the
 * user's browser: renaming one loses what is stored under it, silently. Adding a third
 * one in English would leave the same store split across two languages.
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
    { name: 'evault.orden' },
  ),
)
