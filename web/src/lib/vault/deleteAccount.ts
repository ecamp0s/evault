import { api, interpretError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { listVaults } from '@/lib/vault/api'
import { deriveKeys, openVaultKey } from '@/lib/vault/crypto'
import { forgetCachedAccount } from '@/lib/vault/deviceCache'
import { useVaultKey } from '@/lib/vault/keyInMemory'

/**
 * Deleting the account, and leaving this device as if it had never been here. See
 * ADR-024.
 *
 * THE MASTER PASSWORD IS PROVED HERE BEFORE ANYTHING IS SENT, by opening the vault's
 * wrapper with it. Not for the server's sake —it checks the hash itself— but for this
 * session's: a wrong password would come back as a 401, and a 401 is what the session
 * interceptor reads as «this token is dead», signing out somebody who only mistyped. It
 * is the same order `changeMasterPassword` follows, for the same reason.
 *
 * The salt is the ACCOUNT's email and not the one typed: the typed one is the
 * confirmation of ADR-024 §2.5, and the server compares it; deriving from it would turn
 * a typo into a wrong password.
 *
 * AFTER THE SERVER SAYS YES, this device forgets everything of the account, which is
 * signing out plus one step: the key, the offline copy of this account, and the
 * remembered user —the part signing out keeps and this must not—. Emptying the session
 * is what sends the guards to the login screen.
 */
export async function deleteAccount(
  accountEmail: string,
  typedEmail: string,
  masterPassword: string,
): Promise<void> {
  const { masterKey, authHash } = await deriveKeys(masterPassword, accountEmail)
  const vaults = await listVaults()

  // Throws DecryptionError when the password is not this account's: nothing sent.
  await Promise.all(
    vaults.map((vault) => openVaultKey(masterKey, { data: vault.wrapped_key, iv: vault.wrapped_key_iv })),
  )

  try {
    await api.delete('/auth/account', { data: { current_password: authHash, email: typedEmail } })
  } catch (error) {
    throw interpretError(error)
  }

  useVaultKey.getState().forget()
  await forgetCachedAccount(accountEmail)
  useSession.getState().forgetUser()
}
