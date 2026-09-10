import { api, interpretError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { listVaults } from '@/lib/vault/api'
import { deriveKeys } from '@/lib/vault/crypto'
import { assertPasskey, registerPasskey } from '@/lib/vault/passkey'
import { unlockVaultWithPasskey } from '@/lib/vault/unlock'
import type { User } from '@/lib/session'

/**
 * Managing the account's passkeys against the server. See ADR-021.
 *
 * It sits apart from `passkey.ts`, which knows about authenticators and knows nothing
 * about the API, and apart from `api.ts`, which is the vaults' layer. What lives here
 * is the join: talk to the authenticator, then talk to the server.
 */

/** A passkey as the account screen shows it. Never carries the wrapper. */
export interface AccountPasskey {
  id: string
  label: string
  /** The hostname it belongs to, and the only one it unlocks through. See #578. */
  rp_id: string
  created_at: string | null
  last_used_at: string | null
}

/** The passkeys registered on this account. */
export async function listPasskeys(): Promise<AccountPasskey[]> {
  try {
    const { data } = await api.get<{ data: AccountPasskey[] }>('/auth/passkeys')

    return data.data
  } catch (error) {
    throw interpretError(error)
  }
}

/**
 * Registers a passkey for this account.
 *
 * IT ASKS FOR THE MASTER PASSWORD, and that is not friction that could be trimmed. The
 * wrapper is made by opening the ordinary one, which takes the master key; without it
 * there is nothing to wrap. The side effect is the right one, the same `createRecoveryKey`
 * already has: making a new key to the vault comes to require proving you hold the old
 * one, which is what anybody would expect of an operation like this.
 *
 * Sending comes after everything cryptographic has gone well — the order of #59. If the
 * master password is wrong, `registerPasskey` throws and nothing has been sent.
 */
export async function addPasskey(
  email: string,
  masterPassword: string,
  label: string,
): Promise<void> {
  const { masterKey } = await deriveKeys(masterPassword, email)

  /*
   * The personal one, or the first if there were none — the same choice `unlockVault`
   * makes, written the same way so the day of the vault picker moves both together.
   */
  const vaults = await listVaults()
  const vault = vaults.find(({ is_personal }) => is_personal) ?? vaults[0]

  if (!vault) throw new Error('Esta cuenta no tiene ninguna vault')

  const registered = await registerPasskey(email, masterKey, {
    data: vault.wrapped_key,
    iv: vault.wrapped_key_iv,
  })

  try {
    await api.post('/auth/passkeys', {
      vault_id: vault.id,
      credential_id: registered.credentialId,
      label,
      rp_id: registered.rpId,
      auth_hash: registered.authHash,
      wrapped_key: registered.wrappedKey.data,
      wrapped_key_iv: registered.wrappedKey.iv,
    })
  } catch (error) {
    throw interpretError(error)
  }
}

/**
 * Revokes one passkey.
 *
 * It touches nothing else: each passkey wraps the same vault key on its own, so this
 * costs one row and no re-encryption. Whoever loses a laptop does not have to
 * reconfigure the rest.
 */
export async function revokePasskey(id: string): Promise<void> {
  try {
    await api.delete(`/auth/passkeys/${id}`)
  } catch (error) {
    throw interpretError(error)
  }
}

/** What the unlock endpoint answers with. */
interface PasskeyUnlockResponse {
  data: {
    user: User
    token: string
    vault_id: string
    wrapped_key: string
    wrapped_key_iv: string
  }
}

/**
 * Opens the vault with a passkey, from the lock screen. See ADR-021.
 *
 * The twin of `logIn`, and written to look like it on purpose: verify, ask the server,
 * open the wrapper, and only then publish the session. Publishing it before the vault is
 * open would leave the intermediate state of a token with no key — which exists
 * legitimately on reload, where it IS the vault locking, but here would only be a
 * half-done failure with the interface showing itself as open over nothing.
 *
 * IT DOES NOT FALL BACK TO THE CACHE, unlike `logIn`, and that is not an omission: the
 * offline path needs the wrapper this device already holds and is #564. Doing half of it
 * here would leave two ways of opening the same thing, free to drift.
 *
 * The email is the one this device remembers, which is what the unlock screen is built
 * around, and it is needed because it is the HKDF salt.
 */
export async function unlockWithPasskey(): Promise<void> {
  const { rememberedUser } = useSession.getState()

  if (!rememberedUser) {
    // The same guard `unlock` carries, and for the same reason: without a remembered
    // account there is no email to derive from, and an empty one would fail as if the
    // passkey were wrong.
    throw new Error('No hay ninguna cuenta recordada en este navegador')
  }

  /*
   * The biometric step comes FIRST, before any request. Somebody who dismisses Face ID
   * has not failed at anything, and nothing should have travelled by then.
   */
  const { authHash, wrapKey } = await assertPasskey(rememberedUser.email)

  let session: PasskeyUnlockResponse['data']

  try {
    const { data } = await api.post<PasskeyUnlockResponse>('/auth/passkey', {
      email: rememberedUser.email,
      auth_hash: authHash,
    })

    session = data.data
  } catch (error) {
    throw interpretError(error)
  }

  // If this throws, nothing has been touched: no session published and no token stored.
  await unlockVaultWithPasskey(wrapKey, {
    data: session.wrapped_key,
    iv: session.wrapped_key_iv,
  })

  useSession.getState().authenticate(session.user, session.token)
}
