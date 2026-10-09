import type { NavigateFunction } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { hasUnsavedRecoveryKey, hasUnsavedWork } from '@/lib/vault/unsavedWork'

const DISCARDED_ID = 'auto-lock-discarded'

/**
 * Locks the vault: the one path for the inactivity clock (#220), the user menu and the
 * keyboard shortcut (#788), so that locking by hand cannot drift into a second state.
 *
 * EXACTLY THE SAME AS RELOADING THE PAGE. It discards the token and the key and leaves the
 * user remembered, which is what `clearSession` does by design, so the user ends up on the
 * usual unlock screen — the one that does not ask for the email. Locking is not evicting,
 * and the copy kept for offline reading stays (ADR-019): that is what separates it from
 * signing out.
 *
 * It does not tell the server. The token dies here just as it dies on reload, and the
 * next unlock replaces it (#725). A request would add one more possible failure — a downed
 * network leaving the lock half done — and a lock has to work without a network too.
 */
export function lockVault(navigate: NavigateFunction) {
  /*
   * Read before clearing anything: locking unmounts the dialog that was holding the
   * work, and by then there is nothing left to ask.
   */
  const lostWork = hasUnsavedWork()
  const lostRecoveryKey = hasUnsavedRecoveryKey()

  useSession.getState().clearSession()
  useVaultKey.getState().forget()
  void navigate('/unlock', { replace: true })

  /*
   * Said after the fact, because whoever comes back to a vanished dialog deserves to be
   * told why instead of wondering whether they ever wrote it. It stays until dismissed:
   * the inactivity lock fires because nobody was at the keyboard, so a notice that fades
   * after four seconds would be read by no one.
   *
   * THE RECOVERY KEY GETS ITS OWN SENTENCE, and it is not a nicety (#329). «Se ha
   * descartado lo que estabas escribiendo» describes a lost draft, and what has been lost
   * is the only readable copy of a key that IS ALREADY REGISTERED: the account will say it
   * has one. Whoever reads the generic sentence has no reason to do anything; whoever
   * reads this one knows they have to generate another, and knows it today instead of on
   * the day they need it.
   */
  if (lostWork) {
    toast.warning(
      lostRecoveryKey
        ? 'Se ha descartado la clave de recuperación que no llegaste a guardar. Tu cuenta figura con una activa, así que genera otra: esa ya no la tiene nadie.'
        : 'Se ha descartado lo que estabas escribiendo, sin guardar.',
      { id: DISCARDED_ID, duration: Infinity },
    )
  }
}
