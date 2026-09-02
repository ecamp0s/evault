import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface User {
  id: number
  name: string
  email: string
  created_at: string | null
  /**
   * Whether a recovery key is registered, not which one.
   *
   * The email change uses it to know whether it has to hand over a new one: changing
   * the email INVALIDATES the recovery one, because the email is the salt its keys are
   * derived from. See ADR-014 and #222.
   */
  has_recovery_key: boolean
}

/** Just enough to greet whoever comes back, with none of it being a secret. */
export interface RememberedUser {
  name: string
  email: string
}

interface SessionState {
  user: User | null
  /**
   * The token, **in memory only**. It dies on reload and on closing the tab, just as
   * the encryption key does. See ADR-007.
   */
  token: string | null
  /**
   * Who was using the application in this browser. This one is persisted, and it is
   * what turns a reload into a lock rather than an eviction: without it there would be
   * no way to know whose master password to ask for.
   */
  rememberedUser: RememberedUser | null
  authenticate: (user: User, token: string) => void
  clearSession: () => void
  forgetUser: () => void
  /**
   * Changes the user's email and the remembered one, which travel together.
   *
   * The remembered one matters more than it looks: it is what the lock screen shows
   * when greeting, so if the old one stayed the greeting would lie and the password
   * would be asked for an email that no longer exists.
   */
  updateEmail: (email: string) => void
}

/**
 * The user's session.
 *
 * THE TOKEN IS NOT PERSISTED. Not here, not in sessionStorage, not in cookies and not
 * in IndexedDB. ADR-007 decides it and the argument lives there in full, but in short:
 * the encryption key cannot be stored in any form, so on reload the master password has
 * to be typed again regardless. Persisting the token would only keep alive a session
 * incapable of showing content, paying the risk of an XSS taking it in exchange for a
 * convenience this product cannot offer.
 *
 * What does survive is the name and the email of whoever signed in. They are no secrets
 * — they typed them into the form themselves — and without them the unlock screen could
 * not say whose vault it is asking to open. The accepted price: whoever opens this
 * browser sees which account was used here. It is what every password manager in the
 * field does, and it can be cleared from the screen itself.
 *
 * The `hidratada` state there used to be is no longer needed: it existed to wait for
 * the token recovered from localStorage to be verified against the API, and now there
 * is no token to recover and nothing to verify. Startup is synchronous.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      rememberedUser: null,
      authenticate: (user, token) =>
        set({
          user,
          token,
          rememberedUser: { name: user.name, email: user.email },
        }),
      /*
       * It closes the session but does not forget who it was: that is the difference
       * between locking and signing out. Reloading, which is the ordinary case, has to
       * lead to the unlock screen and not to a blank sign-in form.
       */
      clearSession: () => set({ user: null, token: null }),
      updateEmail: (email) =>
        set((state) => ({
          user: state.user ? { ...state.user, email } : null,
          rememberedUser: state.rememberedUser ? { ...state.rememberedUser, email } : null,
        })),
      /** Really signing out, or switching account. */
      forgetUser: () => set({ user: null, token: null, rememberedUser: null }),
    }),
    {
      /*
       * THE KEY'S NAME STAYS IN SPANISH ON PURPOSE. It is not a symbol, it is the
       * string under which there is data stored in the browser of whoever already used
       * the application. Changing it would break nothing visible in the tests, but it
       * would leave those people with a blank login instead of their lock screen,
       * because the new store would not find what the old one wrote. See #116.
       */
      name: 'evault.session',
      /*
       * THIS `merge` USED TO ADAPT AN OLD PROPERTY NAME, `usuarioRecordado`, and #476
       * retired that code rather than keeping it: the store is called `evault.session`
       * now, so nothing ever reads the old one again and the fallback could not run.
       *
       * What is worth keeping from what that comment explained, because it will be
       * needed again the next time this store has to change shape: the adaptation went
       * in `merge` and NOT in the `version`/`migrate` pair, which is what one writes
       * first. Zustand only calls `migrate` when the stored value carries a numeric
       * `version`, and this store never declared one, so `migrate` never ran at all.
       * `merge` is called always, version or no version.
       *
       * It stays explicit rather than falling back to zustand's default so that the
       * shape of what is read is stated in one place, next to `partialize`, which states
       * the shape of what is written.
       */
      merge: (persisted, current) => {
        const saved = persisted as { rememberedUser?: RememberedUser | null }

        return { ...current, rememberedUser: saved.rememberedUser ?? null }
      },
      /*
       * The remembered user only. The token staying out of here is the whole of issue
       * #73, so if somebody adds it to this list, they are undoing ADR-007. There is a
       * test that fails if the token appears in localStorage.
       */
      partialize: ({ rememberedUser }) => ({ rememberedUser }),
    },
  ),
)

/*
 * The token travels in the Authorization header and never in cookies: the API is
 * stateless and expects it that way. It is read from the store on every request instead
 * of being set once, so that on signing out it stops being sent without having to
 * reconfigure the client.
 */
api.interceptors.request.use((config) => {
  const { token } = useSession.getState()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/*
 * A 401 on any request means the token is no longer any use: expired, revoked from
 * another device, or the database reset in development. The session is closed locally so
 * that the application stops pretending there is one, and the protected routes do the
 * rest.
 *
 * There is no redirect from here, on purpose. This module does not know the router, and
 * doing it with window.location would cause a full reload. Emptying the store is enough:
 * the guard reacts to the change and navigates.
 */
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const state = (error as { response?: { status?: number } })?.response?.status

    if (state === 401 && useSession.getState().token) {
      useSession.getState().clearSession()
    }

    return Promise.reject(error)
  },
)
