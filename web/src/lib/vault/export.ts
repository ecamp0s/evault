import {
  EXPORT_ITERATIONS,
  EXPORT_SALT_BYTES,
  bytesToBase64,
  deriveExportKey,
  encrypt,
  randomBytes,
} from '@/lib/vault/crypto'
import { isUnreadable } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'

/**
 * Sacar la vault de eVault. Ver ADR-011.
 *
 * Todo ocurre aquí, en el cliente, y no por elegancia: el servidor no puede leer los
 * items, así que no hay ningún endpoint de export ni puede haberlo. Merece decirse
 * en la interfaz, porque es una demostración del modelo más convincente que
 * cualquier explicación.
 */

/** Versión del formato propio. Se comprueba al importar. */
export const EXPORT_FORMAT = 'evault-export'
export const EXPORT_VERSION = 1

/**
 * La cabecera en claro de un fichero cifrado.
 *
 * Es autodescriptiva a propósito: quien lo abra dentro de tres versiones tiene que
 * poder saber cómo se cifró sin adivinarlo. Y NO lleva número de items, ni fecha, ni
 * correo, ni nombre de vault: son metadatos que un fichero robado regalaría gratis,
 * y el proyecto ya rechazó guardar contadores en el servidor por lo mismo.
 */
export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-256-GCM'; iv: string }
  ciphertext: string
}

/** Lo que se lleva quien exporta, más lo que hay que contarle. */
export interface ExportResult {
  contents: string
  /** Cuántos items no se pudieron leer y van fuera. */
  unreadable: number
}

/**
 * Los items que sí se pueden leer, y cuántos no.
 *
 * Un item que no descifra NO aborta el export, y es deliberado: quien tiene una
 * entrada rota es exactamente quien más necesita la copia de las demás. Lo que no se
 * puede hacer es escribir un fichero incompleto sin decirlo, así que se cuentan y
 * quien llama se encarga de contarlo.
 */
function legibles(items: Item[]): { contents: ItemContent[]; unreadable: number } {
  const contents: ItemContent[] = []
  let unreadable = 0

  for (const item of items) {
    if (isUnreadable(item.content)) {
      unreadable += 1

      continue
    }

    contents.push(item.content)
  }

  return { contents, unreadable }
}

/**
 * El formato cifrado, que es el de por defecto.
 *
 * La passphrase es distinta de la contraseña maestra a propósito, y no es una
 * molestia gratuita: la copia tiene que servir el día que se ha perdido justamente
 * esa contraseña, que es el día en que uno va a buscar el backup. Ver ADR-011.
 */
export async function exportEncrypted(
  items: Item[],
  passphrase: string,
): Promise<ExportResult> {
  const { contents, unreadable } = legibles(items)

  const salt = randomBytes(EXPORT_SALT_BYTES)
  const key = await deriveExportKey(passphrase, salt, EXPORT_ITERATIONS)
  const { data, iv } = await encrypt(key, JSON.stringify({ items: contents }))

  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: EXPORT_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-256-GCM', iv },
    ciphertext: data,
  }

  return { contents: JSON.stringify(file, null, 2), unreadable }
}

/** Escapa un valor para CSV: comillas dobladas y el campo entrecomillado. */
function csvValue(value: string | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`
}

/**
 * El formato en claro, para irse a otro gestor.
 *
 * Existe pese al riesgo porque sin él el usuario queda atrapado en eVault, y un
 * gestor que no deja salir es peor que uno que no deja entrar. Las cabeceras son las
 * del CSV de Chrome, que es el que más sitios entienden.
 *
 * Quien llama tiene que haber confirmado antes qué está creando: un fichero con
 * todas las contraseñas legibles.
 */
export function exportPlain(items: Item[]): ExportResult {
  const { contents, unreadable } = legibles(items)

  const filas = contents.map((content) =>
    [
      csvValue(content.nombre),
      csvValue(content.url),
      csvValue(content.usuario),
      csvValue(content.password),
      csvValue(content.notas),
    ].join(','),
  )

  return {
    contents: ['name,url,username,password,note', ...filas].join('\n'),
    unreadable,
  }
}
