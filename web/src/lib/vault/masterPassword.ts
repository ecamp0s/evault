import { api, interpretError } from '@/lib/api'
import { deriveKeys, rewrap } from '@/lib/vault/crypto'
import { listVaults } from '@/lib/vault/api'

/**
 * Changing the master password. See ADR-008.
 *
 * This is where that decision pays its dividend: the vault key does not change, it is
 * only re-wrapped. The items are not touched, so the operation is just as fast with
 * three entries as with three thousand, and it cannot leave the vault half done.
 */
export async function changeMasterPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const current = await deriveKeys(currentPassword, email)
  const next = await deriveKeys(newPassword, email)

  const vaults = await listVaults()

  /*
   * The re-wrapping happens IN FULL before anything is sent. It is the same order that
   * saved item encryption in #59: encrypt first, request after. If the current
   * password were wrong, rewrap throws here and not a single request has gone out, so
   * there is nothing to undo.
   *
   * And that is why this counts as a check of the current password: the server
   * accepting the hash is not enough, because the server validates identity and not
   * the ability to decrypt. What proves the password is the right one is that it opens
   * the wrapper.
   */
  const wrappedKeys = await Promise.all(
    vaults.map(async (vault) => {
      const rewrapped = await rewrap(
        current.masterKey,
        { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
        next.masterKey,
      )

      return {
        vault_id: vault.id,
        wrapped_key: rewrapped.data,
        wrapped_key_iv: rewrapped.iv,
      }
    }),
  )

  try {
    await api.put('/auth/master-password', {
      current_password: current.authHash,
      password: next.authHash,
      wrapped_keys: wrappedKeys,
    })
  } catch (error) {
    throw interpretError(error)
  }
}
