import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Which accounts closed the getting-started card in this browser (#790).
 *
 * THE ONLY THING ABOUT IT THAT IS STORED. The steps themselves are derived from the
 * account every time —`has_recovery_key` and the list of passkeys— so the server learns
 * nothing new and a step disappears the moment it stops being true. What is kept here is
 * only that somebody chose not to see it, and a device decision like `offlinePreference`:
 * the same person may hide it on one browser and still see it on another.
 *
 * By email, lower-cased like everywhere the email is a key, because two accounts can share
 * a browser. The key is in English, like every other persisted one (#476).
 */
interface GettingStartedState {
  dismissed: string[]
  dismiss: (email: string) => void
}

/*
 * Every access guarded, because `localStorage` can throw: a private window, blocked site
 * data or a full quota. The card is a convenience, so a browser that cannot remember the
 * choice gets a card it can hide for this visit, never an error from the close button.
 * Zustand already catches a failing read while hydrating; a failing write it lets through.
 */
const guardedStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Not remembered beyond this visit, which is all that is lost.
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // Nothing to undo.
    }
  },
}))

export const useGettingStarted = create<GettingStartedState>()(
  persist(
    (set) => ({
      dismissed: [],
      dismiss: (email) =>
        set((state) => {
          const key = email.trim().toLowerCase()
          return state.dismissed.includes(key) ? state : { dismissed: [...state.dismissed, key] }
        }),
    }),
    { name: 'evault.gettingStarted', storage: guardedStorage },
  ),
)

export function isDismissed(dismissed: string[], email: string): boolean {
  return dismissed.includes(email.trim().toLowerCase())
}
