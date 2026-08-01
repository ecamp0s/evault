import type { ContenidoDeItem, ItemCifrado, PayloadDeItem } from '@/lib/vault/tipos'

/**
 * AQUÍ NO SE CIFRA NADA.
 *
 * Este módulo convierte el contenido de un item en el payload que viaja a la API,
 * y de vuelta. Durante la Iteración 2 esa conversión es base64 sobre JSON: una
 * codificación reversible que cualquiera puede deshacer, no criptografía. El
 * nombre del fichero lo dice para que nadie lo confunda leyendo por encima.
 *
 * Es deliberado y tiene su issue: se sustituye por AES-256-GCM con clave derivada
 * de la contraseña maestra en la Iteración 3. El contrato de la API ya es el
 * definitivo, así que ese cambio se hace aquí dentro y en ningún otro sitio. Esa es
 * la razón de que exista este módulo en vez de resolver la codificación en cada
 * pantalla.
 *
 * Condición que va con la excepción, y que no es negociable: no se despliega con
 * datos reales hasta que la Iteración 3 cierre.
 *
 * Ver ADR-001 y docs/architecture/FOUNDATION.md.
 */

/** Versión del esquema. La 2 queda reservada para el cifrado real. */
export const VERSION_SIN_CIFRAR = 1

/**
 * Marcador en lugar del nonce.
 *
 * La columna existe porque el contrato ya es el definitivo, pero sin cifrado no
 * hay nonce que poner. Un literal reconocible es mejor que bytes aleatorios que
 * aparentarían un cifrado que no existe.
 */
export const IV_SIN_CIFRAR = 'sin-cifrar'

/*
 * btoa y atob solo manejan latin1, así que un nombre con eñe o con kanji los
 * rompe. Se pasa por UTF-8 explícitamente en los dos sentidos.
 */

function aBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)

  let binario = ''

  for (const byte of bytes) {
    binario += String.fromCharCode(byte)
  }

  return btoa(binario)
}

function desdeBase64(base64: string): string {
  const binario = atob(base64)
  const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

/** Prepara el contenido para mandarlo a la API. */
export function empaquetar(contenido: ContenidoDeItem): PayloadDeItem {
  return {
    ciphertext: aBase64(JSON.stringify(contenido)),
    iv: IV_SIN_CIFRAR,
    version: VERSION_SIN_CIFRAR,
  }
}

/**
 * Recupera el contenido de un item que viene de la API.
 *
 * Un item que no se puede leer no tumba la lista entera: se devuelve con un nombre
 * que lo dice y sin inventarse el resto. Puede pasar con una versión de esquema
 * posterior escrita por otro cliente, y en la Iteración 3 pasará también con un
 * item cifrado con otra contraseña maestra. Perder una fila es malo; perder la
 * pantalla entera por una fila es peor.
 */
export function desempaquetar(item: ItemCifrado): ContenidoDeItem {
  if (item.version !== VERSION_SIN_CIFRAR) {
    return { nombre: 'No se puede leer esta entrada' }
  }

  try {
    const contenido: unknown = JSON.parse(desdeBase64(item.ciphertext))

    if (typeof contenido !== 'object' || contenido === null) {
      return { nombre: 'No se puede leer esta entrada' }
    }

    const { nombre, ...resto } = contenido as ContenidoDeItem

    return { nombre: typeof nombre === 'string' ? nombre : 'Sin nombre', ...resto }
  } catch {
    return { nombre: 'No se puede leer esta entrada' }
  }
}
