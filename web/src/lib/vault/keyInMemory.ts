import { create } from 'zustand'

/**
 * LA CLAVE DE LA VAULT, Y SOLO EN MEMORIA.
 *
 * El nombre del fichero es el mensaje, igual que lo era el de sinCifrar.ts: aquí no
 * hay persistencia y no debe haberla nunca. Ni localStorage, ni sessionStorage, ni
 * cookies, ni IndexedDB, ni como CryptoKey no extraíble. Lo prohíbe ADR-007 y el
 * motivo está argumentado allí: guardarla dejaría entrar a cualquiera que tenga el
 * dispositivo, sin saber la contraseña maestra, que es justo lo que un gestor de
 * contraseñas no puede permitir.
 *
 * Recargar la página vacía esto, y eso no es un defecto: es el bloqueo de la vault.
 *
 * Es un store de zustand y no una variable de módulo porque la interfaz tiene que
 * reaccionar cuando la clave aparece o desaparece. Con una variable suelta, la
 * pantalla que enseña los items no se enteraría de que la vault se ha bloqueado.
 */

interface KeyState {
  /** Null significa vault bloqueada: hay sesión, pero no se puede descifrar nada. */
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
 * La vault está bloqueada: hay sesión, pero no hay con qué descifrar.
 *
 * Desde la Iteración 3 es un estado legítimo y no una avería —ocurre al recargar,
 * ver ADR-007— así que tiene su propio error en vez de confundirse con un fallo de
 * descifrado. Lo que hay que hacer ante uno y otro no se parece: aquí se pide la
 * contraseña maestra, y ante un fallo de descifrado no hay nada que pedir.
 */
export class VaultLocked extends Error {
  constructor() {
    super('La vault está bloqueada')
    this.name = 'VaultBloqueada'
  }
}

/**
 * La clave fuera de React, para quien no es un componente.
 *
 * La capa de datos la necesita al cifrar y descifrar, y esa capa no es un hook.
 */
export function currentVaultKey(): CryptoKey | null {
  return useVaultKey.getState().key
}

/**
 * La clave, o un error que dice por qué no la hay.
 *
 * Existe para que ningún camino de la capa de datos pueda continuar sin clave
 * dando por hecho que ya aparecerá. Sin esto, un `null` colándose hasta
 * `crypto.subtle` produciría un error de tipos en tiempo de ejecución, sin decir en
 * ningún momento que lo que pasa es que la vault está cerrada.
 */
export function vaultKeyOrFail(): CryptoKey {
  const key = currentVaultKey()

  if (!key) {
    throw new VaultLocked()
  }

  return key
}
