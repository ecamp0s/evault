import { ApiError, api, interpretError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { listVaults } from '@/lib/vault/api'
import { deriveKeys } from '@/lib/vault/crypto'
import { assertPasskey, registerPasskey } from '@/lib/vault/passkey'
import { unlockVaultWithPasskey } from '@/lib/vault/unlock'
import { cachePasskey, forgetCachedPasskey, readCachedAccount } from '@/lib/vault/deviceCache'
import { offlineCacheEnabled } from '@/lib/vault/offlinePreference'
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

  /*
   * Kept on this device AFTER the server accepted it, so a passkey the account does not
   * know about is never left able to open the vault offline.
   *
   * It is seeded here and not left for the next unlock, for the reason the offline
   * screen already learned: a switch that stores nothing looks identical until the day
   * it matters, and that day is the first time there is no network. See #462.
   */
  await keepForOffline(email, {
    credentialId: registered.credentialId,
    wrappedKey: registered.wrappedKey.data,
    wrappedKeyIv: registered.wrappedKey.iv,
  })
}

/**
 * Stores a passkey wrapper on this device, if this device was asked to keep a copy.
 *
 * FIRE AND FORGET, like `keepForOffline` in `api.ts` and for the same reason: failing to
 * cache is not a reason to fail the operation that produced the data. The passkey is
 * registered either way; what would be missing is the offline shortcut.
 */
async function keepForOffline(email: string, passkey: CachedPasskeyInput): Promise<void> {
  if (!offlineCacheEnabled()) return

  /*
   * No `catch` here, and its absence is deliberate rather than an oversight:
   * `cachePasskey` swallows its own failures and answers `false`, exactly as
   * `keepForOffline` in api.ts relies on. A second guard on top would be unreachable
   * code that also stops this file from reaching the coverage floor of lib/vault —
   * which is how it got noticed.
   */
  await cachePasskey(email, passkey)
}

interface CachedPasskeyInput {
  credentialId: string
  wrappedKey: string
  wrappedKeyIv: string
}

/**
 * Revokes one passkey.
 *
 * It touches nothing else: each passkey wraps the same vault key on its own, so this
 * costs one row and no re-encryption. Whoever loses a laptop does not have to
 * reconfigure the rest.
 */
export async function revokePasskey(id: string, credentialId?: string): Promise<void> {
  try {
    await api.delete(`/auth/passkeys/${id}`)
  } catch (error) {
    throw interpretError(error)
  }

  /*
   * And off this device too. Leaving the wrapper in the cache would mean a credential
   * the account no longer recognises still opening the vault here whenever the server
   * is unreachable — which is exactly the state somebody revoking is trying to end.
   *
   * The credential id is optional because the listing does not carry it: #559 keeps the
   * screen's data down to what it needs. When it is not known, the sweep below covers
   * it instead.
   */
  const email = useSession.getState().rememberedUser?.email

  if (email) {
    // No `catch`, for the same reason as in keepForOffline: both of these answer
    // `false` instead of throwing.
    await (credentialId
      ? forgetCachedPasskey(email, credentialId)
      : forgetUnknownPasskeys(email))
  }
}

/**
 * Drops every passkey wrapper this device holds for an account.
 *
 * THE BLUNT INSTRUMENT ON PURPOSE. Revoking arrives with the server's id and not with
 * the credential's, so there is no way to tell from here WHICH cached wrapper just
 * stopped being valid. Dropping them all is the only answer that cannot leave a revoked
 * one behind, and it costs nothing that matters: the next unlock with a passkey that is
 * still good puts its wrapper back.
 *
 * Erring the other way — keeping what might be revoked — would be the failure this
 * whole function exists to prevent.
 */
async function forgetUnknownPasskeys(email: string): Promise<boolean> {
  const cached = await readCachedAccount(email)

  if (!cached?.passkeys?.length) return false

  for (const passkey of cached.passkeys) {
    await forgetCachedPasskey(email, passkey.credentialId)
  }

  return true
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
  const { authHash, wrapKey, credentialId } = await assertPasskey(rememberedUser.email)

  let session: PasskeyUnlockResponse['data']

  try {
    const { data } = await api.post<PasskeyUnlockResponse>('/auth/passkey', {
      email: rememberedUser.email,
      auth_hash: authHash,
    })

    session = data.data
  } catch (error) {
    const failure = interpretError(error)

    /*
     * `isNetwork` is «no answer arrived at all», and it is the ONLY thing that may fall
     * back to this device's copy. A 401 or a 429 DID reach the server and are answers:
     * falling back on those would turn a passkey the account revoked into one that still
     * opens the vault, and a rate limit into a way around it.
     *
     * The same distinction `logIn` makes, and the same reason for making it explicitly:
     * getting it wrong would be invisible, because everything would keep working.
     */
    if (failure.isNetwork) {
      await openFromCache(rememberedUser.email, credentialId, wrapKey)

      return
    }

    throw failure
  }

  // If this throws, nothing has been touched: no session published and no token stored.
  await unlockVaultWithPasskey(wrapKey, {
    data: session.wrapped_key,
    iv: session.wrapped_key_iv,
  })

  useSession.getState().authenticate(session.user, session.token)
}

/**
 * Opens the vault with a passkey from this device's copy, with no server at all.
 *
 * WHY THIS NEEDS NOBODY'S PERMISSION is the argument `unlockVaultFromCache` already
 * makes and that holds here unchanged: the authentication hash only buys a token, and a
 * token only fetches ciphertext. With the wrapper and the ciphertext already here there
 * is nothing left to ask anyone for. The server was never what stood between a wrong
 * secret and the contents — the wrapping was, and here the wrapping is doing its job
 * exactly as it does online.
 *
 * IT DOES NOT PUBLISH A SESSION, and that is not an omission: there is no token to
 * publish. `useSession` learns this is an offline session, which is what makes writing
 * refuse before it sends anything (ADR-019).
 */
async function openFromCache(
  email: string,
  credentialId: string,
  wrapKey: CryptoKey,
): Promise<void> {
  const cached = await readCachedAccount(email)
  const wrapper = cached?.passkeys?.find((k) => k.credentialId === credentialId)

  /*
   * NO COPY HERE IS REPORTED AS THE LACK OF NETWORK, not as a missing passkey. Being
   * told «this device has no copy» after a fingerprint that worked would send somebody
   * to look at their passkey, when what failed is the connection.
   */
  if (!wrapper || !cached) {
    throw new ApiError(
      null,
      {},
      'No hay conexión con el servidor y este dispositivo no guarda una copia de la vault',
    )
  }

  await unlockVaultWithPasskey(wrapKey, {
    data: wrapper.wrappedKey,
    iv: wrapper.wrappedKeyIv,
  })

  /*
   * The name this browser remembered, falling back to the email — the same choice
   * `openFromCache` makes in auth.ts, and for the same reason: somebody has to be
   * greeted and the email is the only true thing to hand.
   */
  const remembered = useSession.getState().rememberedUser
  const name = remembered?.email === email ? remembered.name : email

  useSession.getState().authenticateOffline({ name, email })
}
