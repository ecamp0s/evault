import { type Encrypted, openVaultKey } from '@/lib/vault/crypto'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { listVaults } from '@/lib/vault/api'
import { readCachedAccount } from '@/lib/vault/deviceCache'

/**
 * Opening the vault with the master key.
 *
 * Signing in and unlocking the vault are two different things, and from ADR-007 on it
 * pays not to confuse them: the first says who you are and the second whether
 * anything can be decrypted. At login they happen back to back, but reloading the
 * page only needs the second, which is why this lives apart and not inside entrar().
 */

/**
 * The vault cannot be opened even though the credentials were right.
 *
 * A different failure from «wrong credentials», and the interface has to say it
 * differently, because what the user can do about it is not the same. With bad
 * credentials, they type them again; here, there is nothing to retype.
 */
export class VaultUnreachable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultInaccesible'
  }
}

/**
 * Fetches the wrapped key, opens it and leaves it in memory.
 *
 * Throws VaultInaccesible when there is no vault at all, and lets crypto.ts's
 * DecryptionError through when the master key is not the one that wrapped this one:
 * two different causes, and the caller tells them apart.
 */
export async function unlockVault(masterKey: CryptoKey, token?: string): Promise<void> {
  const vaults = await listVaults(token)

  /*
   * The personal one, or the first if there were none. Today there is always exactly
   * one and the find is redundant, but writing it this way stops the day of the vault
   * picker from opening whichever comes first alphabetically.
   */
  const vault = vaults.find(({ is_personal }) => is_personal) ?? vaults[0]

  if (!vault) {
    /*
     * Should not happen: signing up creates the vault inside the same transaction as
     * the user. If it does, the account is broken, and saying so beats leaving the
     * application in a state where the item list never loads.
     */
    throw new VaultUnreachable('Esta cuenta no tiene ninguna vault')
  }

  const key = await openVaultKey(masterKey, {
    data: vault.wrapped_key,
    iv: vault.wrapped_key_iv,
  })

  useVaultKey.getState().save(key)
}

/**
 * Opens the vault from the copy on this device, with no server at all.
 *
 * WHY THIS NEEDS NOBODY'S PERMISSION, which is the part that looks wrong and is not.
 * By `ADR-008` the authentication hash only buys a token, and a token only fetches
 * ciphertext. With the ciphertext already here there is nothing left to ask anyone
 * for: derive, unwrap, decrypt. The server was never the thing standing between a
 * wrong password and the contents — the wrapping was.
 *
 * AND A WRONG PASSWORD FAILS EXACTLY AS IT DOES ONLINE, through the same
 * `DecryptionError` from `openVaultKey`, because it is the same operation on the same
 * bytes. No second code path, and so no second behaviour to keep in step.
 *
 * Throws VaultUnreachable when this device has no copy, which the caller has to tell
 * apart from a wrong password: one of them is worth retyping and the other is not.
 */
export async function unlockVaultFromCache(masterKey: CryptoKey, email: string): Promise<void> {
  const cached = await readCachedAccount(email)

  if (!cached) {
    throw new VaultUnreachable('Este dispositivo no tiene una copia de la vault')
  }

  const key = await openVaultKey(masterKey, {
    data: cached.vault.wrappedKey,
    iv: cached.vault.wrappedKeyIv,
  })

  useVaultKey.getState().save(key)
}

/**
 * Opens the vault with a passkey, from the wrapper that passkey closed.
 *
 * THE THIRD WAY IN AND THE THIRD TIME THIS IS THE SAME OPERATION. It takes a wrapping
 * key and a wrapper and calls the same openVaultKey as the master password and as the
 * cached copy, on the same kind of bytes. There is no second code path here, and so no
 * second behaviour to keep in step — which is the property that made unlocking offline
 * safe to add in ADR-019 and that ADR-021 leans on again.
 *
 * IT TAKES THE WRAPPER RATHER THAN FETCHING IT, and that is what makes it serve both
 * ways in: online the wrapper arrives with the token from POST /api/auth/passkey, and
 * offline it is read from this device's cache without a single request. The caller
 * knows which of the two it is; this does not need to.
 *
 * Fails with the same DecryptionError as a wrong master password, through the same
 * function and for the same reason: the key does not open these bytes. The caller does
 * not get told which of the three ways in produced it, because there is nothing
 * different to do about it.
 */
export async function unlockVaultWithPasskey(
  wrapKey: CryptoKey,
  wrapped: Encrypted,
): Promise<void> {
  useVaultKey.getState().save(await openVaultKey(wrapKey, wrapped))
}
