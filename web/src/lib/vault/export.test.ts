import { describe, expect, it } from 'vitest'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportEncrypted,
  exportPlain,
  type ExportFile,
} from '@/lib/vault/export'
import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { UNREADABLE } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'

/*
 * Las cinco cadenas que se buscan después en el fichero cifrado. Es el mismo método
 * con el que la Iteración 3 comprobó que el servidor no podía leer nada: escribir
 * valores reconocibles y buscarlos.
 */
const SECRETS = {
  nombre: 'GitHub-RECONOCIBLE',
  usuario: 'ada-RECONOCIBLE@example.com',
  password: 'contraseña-RECONOCIBLE',
  url: 'https://github-RECONOCIBLE.com',
  notas: 'notas-RECONOCIBLES',
}

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

// El marcador real, no una copia: isUnreadable compara por identidad a propósito.
const UNREADABLE_CONTENT = UNREADABLE

describe('el formato cifrado', () => {
  /*
   * EL CRITERIO DE SALIDA DE LA ITERACIÓN, comprobado como se comprobó el de #59:
   * ninguna de las cadenas escritas puede aparecer en el fichero.
   */
  it('no contiene ninguna de las cadenas que se guardaron', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')

    for (const value of Object.values(SECRETS)) {
      expect(contents).not.toContain(value)
    }
  })

  it('tampoco contiene los nombres de los campos del blob', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')

    expect(contents).not.toContain('usuario')
    expect(contents).not.toContain('notas')
  })

  /*
   * Autodescriptivo: quien lo abra dentro de tres versiones tiene que poder saber
   * cómo se cifró sin adivinarlo. Sin esto, subir las iteraciones dejaría ilegibles
   * todos los ficheros anteriores.
   */
  it('lleva dentro sus propios parámetros de derivación', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    expect(file.format).toBe(EXPORT_FORMAT)
    expect(file.version).toBe(EXPORT_VERSION)
    expect(file.kdf.name).toBe('PBKDF2')
    expect(file.kdf.iterations).toBeGreaterThanOrEqual(600_000)
    expect(file.kdf.salt).not.toHaveLength(0)
    expect(file.cipher.iv).not.toHaveLength(0)
  })

  /*
   * Lo que deliberadamente NO lleva. Son metadatos que un fichero robado regalaría
   * gratis: cuántas contraseñas tienes y de quién es la copia.
   */
  it('no revela cuántos items hay ni de quién es la vault', async () => {
    const { contents } = await exportEncrypted(
      [item(SECRETS, '1'), item(SECRETS, '2'), item(SECRETS, '3')],
      'la-passphrase',
    )
    const file = JSON.parse(contents) as Record<string, unknown>

    expect(Object.keys(file).sort()).toEqual(
      ['cipher', 'ciphertext', 'format', 'kdf', 'version'].sort(),
    )
    expect(contents).not.toContain('@')
  })

  it('se puede volver a abrir con la passphrase', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toEqual([SECRETS])
  })

  it('no se abre con otra passphrase', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'otra-distinta',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    await expect(decrypt(key, { data: file.ciphertext, iv: file.cipher.iv })).rejects.toThrow()
  })

  it('usa un salt distinto en cada export', async () => {
    const firstOne = JSON.parse((await exportEncrypted([item(SECRETS)], 'p')).contents) as ExportFile
    const secondOne = JSON.parse((await exportEncrypted([item(SECRETS)], 'p')).contents) as ExportFile

    expect(firstOne.kdf.salt).not.toBe(secondOne.kdf.salt)
  })
})

/*
 * Un item que no descifra no puede llevarse por delante la copia de los demás: quien
 * tiene una entrada rota es justo quien más necesita el resto. Pero tampoco se puede
 * escribir un fichero incompleto sin decirlo.
 */
describe('items que no se pueden leer', () => {
  it('exporta los que sí abren y cuenta los que no', async () => {
    const { contents, unreadable } = await exportEncrypted(
      [item(SECRETS, '1'), item(UNREADABLE_CONTENT, '2'), item(SECRETS, '3')],
      'la-passphrase',
    )

    expect(unreadable).toBe(1)

    const file = JSON.parse(contents) as ExportFile
    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )
    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toHaveLength(2)
  })

  it('no mete el marcador de ilegible dentro del fichero', async () => {
    const { contents } = await exportEncrypted([item(UNREADABLE_CONTENT)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile
    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )
    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toEqual([])
  })
})

describe('el formato en claro', () => {
  it('escribe las cabeceras que entienden otros gestores', () => {
    expect(exportPlain([]).contents).toBe('name,url,username,password,note')
  })

  it('sí contiene las contraseñas, que es su razón de ser y su riesgo', () => {
    const { contents } = exportPlain([item(SECRETS)])

    expect(contents).toContain(SECRETS.password)
    expect(contents).toContain(SECRETS.nombre)
  })

  /*
   * Un valor con comillas o comas rompería el CSV y, peor, podría partir un campo en
   * dos y meter una contraseña en la columna equivocada al reimportarlo.
   */
  it('escapa comillas, comas y saltos de línea', () => {
    const { contents } = exportPlain([
      item({ nombre: 'Con "comillas", comas', password: 'línea 1\nlínea 2' }),
    ])

    expect(contents).toContain('"Con ""comillas"", comas"')
    expect(contents).toContain('"línea 1\nlínea 2"')
  })

  it('deja vacías las columnas de los campos que no se rellenaron', () => {
    const { contents } = exportPlain([item({ nombre: 'Solo el nombre' })])

    expect(contents.split('\n')[1]).toBe('"Solo el nombre","","","",""')
  })

  it('también cuenta los que no se pueden leer', () => {
    expect(exportPlain([item(SECRETS, '1'), item(UNREADABLE_CONTENT, '2')]).unreadable).toBe(1)
  })
})
