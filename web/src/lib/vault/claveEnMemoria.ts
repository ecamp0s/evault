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

interface EstadoDeLaClave {
  /** Null significa vault bloqueada: hay sesión, pero no se puede descifrar nada. */
  clave: CryptoKey | null
  guardar: (clave: CryptoKey) => void
  olvidar: () => void
}

export const useClaveDeVault = create<EstadoDeLaClave>()((set) => ({
  clave: null,
  guardar: (clave) => set({ clave }),
  olvidar: () => set({ clave: null }),
}))

/**
 * La vault está bloqueada: hay sesión, pero no hay con qué descifrar.
 *
 * Desde la Iteración 3 es un estado legítimo y no una avería —ocurre al recargar,
 * ver ADR-007— así que tiene su propio error en vez de confundirse con un fallo de
 * descifrado. Lo que hay que hacer ante uno y otro no se parece: aquí se pide la
 * contraseña maestra, y ante un fallo de descifrado no hay nada que pedir.
 */
export class VaultBloqueada extends Error {
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
export function claveDeVaultActual(): CryptoKey | null {
  return useClaveDeVault.getState().clave
}

/**
 * La clave, o un error que dice por qué no la hay.
 *
 * Existe para que ningún camino de la capa de datos pueda continuar sin clave
 * dando por hecho que ya aparecerá. Sin esto, un `null` colándose hasta
 * `crypto.subtle` produciría un error de tipos en tiempo de ejecución, sin decir en
 * ningún momento que lo que pasa es que la vault está cerrada.
 */
export function claveDeVaultOFallar(): CryptoKey {
  const clave = claveDeVaultActual()

  if (!clave) {
    throw new VaultBloqueada()
  }

  return clave
}
