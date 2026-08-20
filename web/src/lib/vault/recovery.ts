import { api, interpretError } from '@/lib/api'
import {
  deriveKeys,
  deriveRecoveryKeys,
  rewrap,
  wrapVaultKeyForRecovery,
} from '@/lib/vault/crypto'
import { generateRecoveryKey, type GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'
import { listVaults } from '@/lib/vault/api'

/** What the recovery endpoint returns for each vault. */
interface RecoveryWrappedKey {
  vault_id: string
  recovery_wrapped_key: string
  recovery_wrapped_key_iv: string
}

/**
 * Generating the recovery key and registering it. See ADR-010.
 *
 * Everything that matters happens here in the client: the secret is generated on this
 * device, it wraps the vault key on this device, and all that travels to the server is
 * a blob it cannot open and a hash it cannot come back from.
 *
 * It asks for the master password instead of using the vault key already in memory,
 * and that is not an oversight. The vault key is imported as NOT extractable, so its
 * material cannot be read back to wrap it again; what can be done is opening the
 * wrapper that already exists, and that needs the master key.
 *
 * The side effect is a good one: making a second key to the vault comes to require the
 * password, which is what anyone would expect of an operation like this.
 */
export async function createRecoveryKey(
  email: string,
  masterPassword: string,
): Promise<GeneratedRecoveryKey> {
  const { masterKey } = await deriveKeys(masterPassword, email)
  const generated = generateRecoveryKey()
  const { wrapKey, authHash } = await deriveRecoveryKeys(generated.bytes, email)

  /*
   * EVERY vault's key gets re-wrapped. Today there is always one, but the wrapper is
   * per member and per vault since ADR-008, and a vault with no recovery wrapper is a
   * vault the key would not open on the day it was needed.
   */
  const vaults = await listVaults()

  const wrappedKeys = await Promise.all(
    vaults.map(async (vault) => {
      const wrapped = await wrapVaultKeyForRecovery(
        masterKey,
        { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
        wrapKey,
      )

      return {
        vault_id: vault.id,
        recovery_wrapped_key: wrapped.data,
        recovery_wrapped_key_iv: wrapped.iv,
      }
    }),
  )

  /*
   * Sending comes after everything cryptographic has gone well. It is the same order
   * that saved item encryption in #59: encrypt first, request after. If the master
   * password were wrong, wrapVaultKeyForRecovery throws and nothing has been sent.
   */
  try {
    await api.post('/auth/recovery-key', {
      recovery_auth_hash: authHash,
      wrapped_keys: wrappedKeys,
    })
  } catch (error) {
    throw interpretError(error)
  }

  return generated
}

/**
 * Recovers access with the recovery key and sets a new password.
 *
 * It is the complete path of ADR-010 and cannot be split: whoever finishes here gets
 * in with a master password they have just chosen. Leaving it half done — inside but
 * with no usable password — would leave the account hanging off the piece of paper.
 *
 * None of this goes through the server except the blobs: the wrapper is opened on this
 * device and the vault key never leaves here in the clear.
 */
export async function recoverAccess(
  email: string,
  recoveryKeyBytes: Uint8Array<ArrayBuffer>,
  newMasterPassword: string,
): Promise<void> {
  const { wrapKey, authHash } = await deriveRecoveryKeys(recoveryKeyBytes, email)

  let response: { wrapped_keys: RecoveryWrappedKey[]; token: string }

  try {
    const { data } = await api.post<{ data: { wrapped_keys: RecoveryWrappedKey[]; token: string } }>(
      '/auth/recover',
      { email, recovery_auth_hash: authHash },
    )

    response = data.data
  } catch (error) {
    throw interpretError(error)
  }

  /*
   * From here on it is no longer a credentials problem: the server has said the key is
   * the right one. If the wrapper does not open, that is something else, and the
   * interface has to say it differently. It is the same distinction Iteration 3 drew
   * between «wrong credentials» and «the vault cannot be opened».
   */
  const { masterKey, authHash: newAuthHash } = await deriveKeys(newMasterPassword, email)

  const wrappedKeys = await Promise.all(
    response.wrapped_keys.map(async (entry) => {
      const rewrapped = await rewrap(
        wrapKey,
        { data: entry.recovery_wrapped_key, iv: entry.recovery_wrapped_key_iv },
        masterKey,
      )

      return {
        vault_id: entry.vault_id,
        wrapped_key: rewrapped.data,
        wrapped_key_iv: rewrapped.iv,
      }
    }),
  )

  try {
    await api.post(
      '/auth/recover/complete',
      { password: newAuthHash, wrapped_keys: wrappedKeys },
      { headers: { Authorization: `Bearer ${response.token}` } },
    )
  } catch (error) {
    throw interpretError(error)
  }
}
