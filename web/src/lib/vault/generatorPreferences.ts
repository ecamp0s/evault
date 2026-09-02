import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_OPTIONS,
  type CharacterClass,
  type PasswordOptions,
} from '@/lib/vault/passwordGenerator'

/**
 * The generator's preferences, remembered between uses.
 *
 * This one **is** persisted, unlike the token and the vault key, and the difference is
 * not convenience but what each thing is: there is no secret here, only how long a
 * password is and which characters it carries. Nobody decrypts anything with that.
 *
 * It is remembered because whoever sets the length to 32 does it for a reason, and
 * setting it again on every new entry turns a preference into a chore.
 *
 * A store of its own and not state inside the component: the dialog is mounted and
 * unmounted with each entry — keyed per item, see ItemList — so its local state
 * would die between one and the next.
 */

interface GeneratorPreferencesState extends PasswordOptions {
  setLength: (length: number) => void
  toggleClass: (name: CharacterClass) => void
}

export const useGeneratorPreferences = create<GeneratorPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_OPTIONS,
      setLength: (length) => set({ length }),
      /*
       * Unticking the last active class would leave options that can generate nothing,
       * so the box does not respond. The alternative — letting it be unticked and
       * showing an error — would punish the user for a state the interface should never
       * have let them reach.
       */
      toggleClass: (name) =>
        set((state) => {
          const classes = { ...state.classes, [name]: !state.classes[name] }

          return Object.values(classes).some(Boolean) ? { classes } : {}
        }),
    }),
    { name: 'evault.generator' },
  ),
)
