import { create } from 'zustand'

/**
 * THE VAULT KEY, AND IN MEMORY ONLY.
 *
 * The file name is the message, as sinCifrar.ts's was: there is no persistence here
 * and there must never be. Not localStorage, not sessionStorage, not cookies, not
 * IndexedDB, not as a non-extractable CryptoKey. ADR-007 forbids it and argues why
 * there: storing it would let in anyone holding the device, without knowing the
 * master password, which is precisely what a password manager cannot allow.
 *
 * Reloading the page empties this, and that is not a defect: it is the vault locking.
 *
 * It is a zustand store and not a module variable because the interface has to react
 * when the key appears or disappears. With a loose variable, the screen showing the
 * items would never learn that the vault had locked.
 */

interface KeyState {
  /** Null means the vault is locked: there is a session, but nothing can be decrypted. */
  key: CryptoKey | null
  save: (key: CryptoKey) => void
  forget: () => void
}

export const useVaultKey = create<KeyState>()((set) => ({
  key: null,
  save: (key) => set({ key }),
  forget: () => set({ key: null }),
}))

/**
 * The vault is locked: there is a session, but nothing to decrypt with.
 *
 * Since Iteration 3 this is a legitimate state and not a fault — it happens on
 * reload, see ADR-007 — so it gets its own error instead of being confused with a
 * decryption failure. What to do about each is nothing alike: here the master
 * password is asked for, and a decryption failure has nothing to ask.
 */
export class VaultLocked extends Error {
  constructor() {
    super('La vault está bloqueada')
    this.name = 'VaultBloqueada'
  }
}

/**
 * The key outside React, for whoever is not a component.
 *
 * The data layer needs it when encrypting and decrypting, and that layer is not a hook.
 */
export function currentVaultKey(): CryptoKey | null {
  return useVaultKey.getState().key
}

/**
 * The key, or an error saying why there is none.
 *
 * It exists so that no path in the data layer can carry on without a key assuming one
 * will turn up. Without this, a `null` reaching `crypto.subtle` would produce a
 * runtime type error, never once saying that what is happening is a closed vault.
 */
export function vaultKeyOrFail(): CryptoKey {
  const key = currentVaultKey()

  if (!key) {
    throw new VaultLocked()
  }

  return key
}
