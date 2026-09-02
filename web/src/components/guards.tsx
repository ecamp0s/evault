import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '@/lib/session'

/*
 * They live in a file of their own and not in main.tsx because there they would break
 * fast refresh: a module that defines components has to export them.
 *
 * There is no «checking» state any more. It existed to wait for the token recovered
 * from localStorage to be verified against the API, and since ADR-007 there is no token
 * to recover: startup is synchronous and the guards can decide immediately.
 *
 * WHAT «BEING IN» MEANS IS A TOKEN **OR** AN OFFLINE SESSION, since ADR-019. Without
 * the second, unlocking from the device cache would open the vault and then bounce
 * straight back to the unlock screen, because no token ever arrived — the vault would
 * be open and unreachable at once.
 *
 * And an offline session is not a weaker one. Nothing was verified by the API, but the
 * API only ever verified enough to hand out a token, and a token only fetches
 * ciphertext. What proves the master password was right is that the vault key
 * unwrapped, and that is the same proof either way.
 */

/** A token, or a session opened against this device's cache. Both are «inside». */
function useHasSession(): boolean {
  const token = useSession((state) => state.token)
  const offline = useSession((state) => state.offline)

  return Boolean(token) || offline
}

export function RequireSession({ children }: { children: ReactNode }) {
  const hasSession = useHasSession()
  const rememberedUser = useSession((state) => state.rememberedUser)
  const location = useLocation()

  if (hasSession) {
    return <>{children}</>
  }

  /*
   * No token but a remembered user is the ordinary case after a reload, and the
   * difference between the two branches below is exactly what ADR-007 asks for: whoever
   * was already inside is asked for the master password — a lock — and only whoever has
   * never signed in on this browser is shown the sign-in form.
   *
   * In both cases where they came from is remembered, to return there afterwards.
   * Without this, reloading on a particular section would always end on the home page.
   */
  return (
    <Navigate
      to={rememberedUser ? '/unlock' : '/login'}
      replace
      state={{ from: location.pathname }}
    />
  )
}

export function RequireNoSession({ children }: { children: ReactNode }) {
  return useHasSession() ? <Navigate to="/" replace /> : <>{children}</>
}

/**
 * The unlock screen only makes sense with a remembered account and no open session.
 *
 * Without this guard, `/unlock` typed by hand would show a form asking for
 * nobody's password, and with an open session it would ask to unlock something already
 * open.
 */
export function RequireLocked({ children }: { children: ReactNode }) {
  const hasSession = useHasSession()
  const rememberedUser = useSession((state) => state.rememberedUser)

  if (hasSession) {
    return <Navigate to="/" replace />
  }

  return rememberedUser ? <>{children}</> : <Navigate to="/login" replace />
}
