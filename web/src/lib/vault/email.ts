import { api, interpretError } from '@/lib/api'
import { deriveKeys, deriveRecoveryKeys, rewrap, wrapVaultKeyForRecovery } from '@/lib/vault/crypto'
import { generateRecoveryKey, type GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'
import { listVaults } from '@/lib/vault/api'

/**
 * Changing the email address. See ADR-014.
 *
 * The email is NOT a profile field: by ADR-008 it is the salt the master key and the
 * recovery keys are derived from. Changing it re-derives both, so this is far closer
 * to rotating the password than to editing a field.
 *
 * What does NOT change is the vault key, and that is why the items are not touched:
 * the operation costs the same with three entries as with three thousand.
 */

/**
 * AND THE ASYMMETRY THAT WILL BE MISREAD, because it is the inverse of the other one:
 *
 * - rotating the master password does NOT invalidate the recovery key, because the
 *   vault key does not change and its wrapper is not touched
 * - changing the email DOES invalidate it, because the email is the salt of the HKDF
 *   its wrapping key and its hash come out of
 *
 * Hence this returning a new key when there was one: leaving the old one would leave
 * the user with a second key that no longer opens and that they believe opens, and
 * that is not found out until the day it is needed.
 */
export async function changeEmail(
  currentEmail: string,
  newEmail: string,
  masterPassword: string,
  hasRecoveryKey: boolean,
): Promise<GeneratedRecoveryKey | null> {
  const current = await deriveKeys(masterPassword, currentEmail)
  const next = await deriveKeys(masterPassword, newEmail)

  const vaults = await listVaults()

  /*
   * EVERYTHING cryptographic happens before the first request goes out. It is the same
   * order that saved item encryption in #59 and the rotation in #125: if the password
   * were wrong, rewrap throws here and nothing has been sent, so there is nothing to
   * undo.
   *
   * And it counts as a check of the password, a stronger one than the server's: the
   * server validates identity — that the hash matches — whereas opening the wrapper
   * validates the ability to decrypt.
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

  /*
   * The new recovery key, only for whoever had one.
   *
   * Whoever did not have one is not saddled with an obligation they never took on:
   * ADR-010 decided it is offered and can be declined, and whoever declined is in a
   * legitimate and permanent state. That is why this has to be known, and why the API
   * says it in has_recovery_key: the client cannot deduce it from anything else.
   */
  const generated = hasRecoveryKey ? generateRecoveryKey() : null
  let recovery: { authHash: string; wrappedKeys: unknown[] } | null = null

  if (generated) {
    const derived = await deriveRecoveryKeys(generated.bytes, newEmail)

    recovery = {
      authHash: derived.authHash,
      wrappedKeys: await Promise.all(
        vaults.map(async (vault) => {
          const wrapped = await wrapVaultKeyForRecovery(
            current.masterKey,
            { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
            derived.wrapKey,
          )

          return {
            vault_id: vault.id,
            recovery_wrapped_key: wrapped.data,
            recovery_wrapped_key_iv: wrapped.iv,
          }
        }),
      ),
    }
  }

  try {
    await api.put('/auth/email', {
      email: newEmail,
      current_password: current.authHash,
      password: next.authHash,
      wrapped_keys: wrappedKeys,
      recovery_auth_hash: recovery?.authHash ?? null,
      recovery_wrapped_keys: recovery?.wrappedKeys ?? [],
    })
  } catch (error) {
    throw interpretError(error)
  }

  return generated
}
