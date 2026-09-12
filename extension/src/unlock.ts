import { DecryptionError, openVaultKey } from '@/lib/vault/crypto'
import { PasskeyUnsupported, assertPasskey } from '@/lib/vault/passkey'
import { ApiFailure, revokeToken, unlockWithPasskeyHash } from './api'
import type { Held } from './custody/keeper'

/**
 * Opening the vault from the extension, with the passkey and nothing else (ADR-023 §2.1).
 *
 * THE WEB'S UNLOCK, WITH ONE PARAMETER CHANGED: the RP ID is the instance's hostname,
 * because the extension's own is its id. The assertion, the derivation and the wrapper
 * are the ones web/src/lib/vault already uses, imported — #665 measured that the passkey
 * the web registered opens the web's wrapper from here.
 */

/** What can go wrong, each with something different the person can do about it. */
export type UnlockProblem =
  /** The biometric dialog was dismissed. Not a failure: somebody changed their mind. */
  | 'cancelled'
  /** This browser or authenticator yields no PRF. Nothing to retry. */
  | 'unsupported'
  /** The instance refused the hash: the passkey was removed, or the email is not the account's. */
  | 'refused'
  /** Too many attempts: the limit of ADR-021 §4, shared with the web and every device. */
  | 'throttled'
  /** No answer at all. The only case that means «no connection» (ADR-019). */
  | 'offline'
  /** A wrapper arrived and this passkey does not open it. */
  | 'mismatch'
  | 'failed'

export class UnlockFailed extends Error {
  readonly problem: UnlockProblem

  constructor(problem: UnlockProblem, options?: { cause?: unknown }) {
    super(`unlock failed: ${problem}`, options)
    this.name = 'UnlockFailed'
    this.problem = problem
  }
}

export interface UnlockDependencies {
  assert: typeof assertPasskey
  exchange: typeof unlockWithPasskeyHash
  open: typeof openVaultKey
  revoke: typeof revokeToken
}

const REAL: UnlockDependencies = {
  assert: assertPasskey,
  exchange: unlockWithPasskeyHash,
  open: openVaultKey,
  revoke: revokeToken,
}

export async function unlock(
  email: string,
  instance: string,
  deps: UnlockDependencies = REAL,
): Promise<Held> {
  let assertion
  try {
    assertion = await deps.assert(email, new URL(instance).hostname)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new UnlockFailed('cancelled', { cause: error })
    }
    throw new UnlockFailed(error instanceof PasskeyUnsupported ? 'unsupported' : 'failed', { cause: error })
  }

  let session
  try {
    session = await deps.exchange(instance, email, assertion.authHash)
  } catch (error) {
    if (error instanceof ApiFailure) {
      if (error.isNetwork) throw new UnlockFailed('offline', { cause: error })
      if (error.status === 401 || error.status === 422) throw new UnlockFailed('refused', { cause: error })
      if (error.status === 429) throw new UnlockFailed('throttled', { cause: error })
    }
    throw new UnlockFailed('failed', { cause: error })
  }

  let key
  try {
    key = await deps.open(assertion.wrapKey, session.wrapped)
  } catch (error) {
    /*
     * A TOKEN WAS ALREADY ISSUED, and nothing is going to use it. Revoking it here is the
     * difference between a failed unlock and a failed unlock that leaves a live session
     * behind on the server.
     */
    void deps.revoke(instance, session.token)
    throw new UnlockFailed(error instanceof DecryptionError ? 'mismatch' : 'failed', { cause: error })
  }

  return { key, token: session.token, vaultId: session.vaultId, email, instance }
}
