/**
 * El contrato de la API de vaults, tal y como lo devuelve el servidor.
 *
 * Estos tipos describen lo que viaja por el cable. Lo que el usuario ve vive
 * dentro del blob y tiene su propio tipo, ContenidoDeItem, que el servidor no
 * conoce ni puede conocer. Ver docs/architecture/FOUNDATION.md.
 */

export interface Vault {
  id: string
  name: string
  is_personal: boolean
  role: 'owner'
}

/**
 * Un item como lo guarda el servidor: bytes opacos, su nonce y la versión del
 * esquema con que se escribieron.
 *
 * No hay ningún campo con significado, y no es una omisión: si el nombre o la URL
 * viajaran en claro, el servidor sabría en qué servicios tiene cuenta el usuario.
 */
export interface ItemCifrado {
  id: string
  vault_id: string
  ciphertext: string
  iv: string
  version: number
  created_at: string | null
  updated_at: string | null
}

/** Lo que se manda al crear o actualizar. Los tres campos van siempre juntos. */
export interface PayloadDeItem {
  ciphertext: string
  iv: string
  version: number
}

/**
 * El contenido real de una entrada, ya descodificado.
 *
 * Todo lo que hay aquí es lo que el servidor nunca debe ver. Añadir un campo a
 * esta interfaz es gratis y no necesita migración, porque el servidor solo
 * almacena el resultado serializado; añadir una columna a la tabla, en cambio, es
 * una decisión de seguridad.
 */
export interface ContenidoDeItem {
  nombre: string
  usuario?: string
  password?: string
  url?: string
  notas?: string
}

/** Un item con su contenido ya descodificado, que es lo que usan las pantallas. */
export interface Item {
  id: string
  vaultId: string
  contenido: ContenidoDeItem
  creadoEn: string | null
  actualizadoEn: string | null
}
