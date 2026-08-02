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
 * La clave fuera de React, para quien no es un componente.
 *
 * La capa de datos la necesita al cifrar y descifrar, y esa capa no es un hook.
 */
export function claveDeVaultActual(): CryptoKey | null {
  return useClaveDeVault.getState().clave
}
