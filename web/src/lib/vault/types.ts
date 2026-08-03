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
  /**
   * La clave que abre esta vault, envuelta con la clave maestra de quien pregunta.
   *
   * Viaja aquí y no en la respuesta del login porque es un dato del vault y no de
   * la sesión: cuando existan las vaults compartidas, cada una traerá la suya. Es
   * además lo que permitió que el contrato de /api/auth no cambiara. Ver ADR-008.
   */
  wrapped_key: string
  wrapped_key_iv: string
}

/**
 * Un item como lo guarda el servidor: bytes opacos, su nonce y la versión del
 * esquema con que se escribieron.
 *
 * No hay ningún campo con significado, y no es una omisión: si el nombre o la URL
 * viajaran en claro, el servidor sabría en qué servicios tiene cuenta el usuario.
 */
export interface EncryptedItem {
  id: string
  vault_id: string
  ciphertext: string
  iv: string
  version: number
  created_at: string | null
  updated_at: string | null
}

/** Lo que se manda al crear o actualizar. Los tres campos van siempre juntos. */
export interface ItemPayload {
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
 *
 * ESTOS NOMBRES DE CAMPO SE QUEDAN EN ESPAÑOL, Y NO ES UN OLVIDO DE LA MIGRACIÓN
 * AL INGLÉS. No son identificadores: son **el formato del blob**. Este objeto se
 * serializa con JSON.stringify y se cifra tal cual, así que sus claves son lo que
 * hay escrito dentro de cada item ya guardado. Renombrar `nombre` a `name` dejaría
 * ilegible todo lo que exista en cualquier vault, sin que el compilador dijera
 * nada y sin forma de repararlo, porque el servidor no puede leer esos datos para
 * migrarlos.
 *
 * El contrato está fijado en docs/architecture/FOUNDATION.md. Si alguna vez hay
 * que cambiarlo, se hace subiendo `version` y migrando item a item desde el
 * cliente, no con un renombrado.
 */
export interface ItemContent {
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
  content: ItemContent
  createdAt: string | null
  updatedAt: string | null
}
