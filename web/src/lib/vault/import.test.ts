import { describe, expect, it } from 'vitest'
import { ImportError, findDuplicates, parseImportFile } from '@/lib/vault/import'
import { exportEncrypted, exportPlain } from '@/lib/vault/export'
import type { Item, ItemContent } from '@/lib/vault/types'

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'v', content, createdAt: null, updatedAt: null }
}

const CHROME = `name,url,username,password,note
GitHub,https://github.com,ada,secreto,la del trabajo
Banco,https://banco.es,0001,otra,`

const BITWARDEN = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
Trabajo,1,login,GitHub,unas notas,campo extra,0,https://github.com,ada,secreto,JBSWY3DPEHPK3PXP`

describe('el formato propio', () => {
  it('lee lo que acaba de exportar', async () => {
    const original: ItemContent = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'secreto',
      url: 'https://github.com',
      notas: 'con eñes: año',
    }

    const { contents } = await exportEncrypted([item(original)], 'la-passphrase')
    const parsed = await parseImportFile(contents, 'la-passphrase')

    expect(parsed.format).toBe('evault')
    expect(parsed.items).toEqual([original])
  })

  it('avisa si la passphrase no es la correcta', async () => {
    const { contents } = await exportEncrypted([item({ nombre: 'X' })], 'la-buena')

    await expect(parseImportFile(contents, 'la-mala')).rejects.toMatchObject({
      problem: 'passphrase-incorrecta',
    })
  })

  /*
   * La versión se comprueba antes de descifrar. Un fichero de una versión que no se
   * conoce se rechaza explicándolo, no se intenta leer «a ver si suena».
   */
  it('rechaza una versión de formato que no conoce', async () => {
    const { contents } = await exportEncrypted([item({ nombre: 'X' })], 'p')
    const future = JSON.stringify({ ...JSON.parse(contents), version: 99 })

    await expect(parseImportFile(future, 'p')).rejects.toMatchObject({
      problem: 'version-desconocida',
    })
  })

  it('rechaza un JSON que no es un export de eVault', async () => {
    await expect(parseImportFile('{"cosa":1}')).rejects.toBeInstanceOf(ImportError)
  })
})

describe('el CSV propio', () => {
  it('lee lo que exporta el propio eVault en claro', async () => {
    const { contents } = exportPlain([
      item({ nombre: 'GitHub', usuario: 'ada', password: 'secreto', url: 'https://github.com' }),
    ])

    const parsed = await parseImportFile(contents)

    expect(parsed.items).toEqual([
      { nombre: 'GitHub', url: 'https://github.com', usuario: 'ada', password: 'secreto' },
    ])
  })

  /*
   * Un campo con comillas y comas es donde un parser flojo parte la fila y mete la
   * contraseña en la columna de al lado. Se comprueba yendo y volviendo.
   */
  it('sobrevive a comillas, comas y saltos de línea', async () => {
    const complex: ItemContent = {
      nombre: 'Con "comillas", comas',
      password: 'línea 1\nlínea 2',
      notas: 'y "más" cosas, aquí',
    }

    const { contents } = exportPlain([item(complex)])
    const parsed = await parseImportFile(contents)

    expect(parsed.items[0]).toEqual(complex)
  })
})

describe('el CSV de Chrome', () => {
  it('reconoce el formato y mapea las columnas', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.format).toBe('chrome')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toEqual({
      nombre: 'GitHub',
      url: 'https://github.com',
      usuario: 'ada',
      password: 'secreto',
      notas: 'la del trabajo',
    })
  })

  it('no inventa campos vacíos', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.items[1]).not.toHaveProperty('notas')
  })
})

describe('el CSV de Bitwarden', () => {
  it('reconoce el formato y mapea sus columnas propias', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.format).toBe('bitwarden')
    expect(parsed.items[0].nombre).toBe('GitHub')
    expect(parsed.items[0].usuario).toBe('ada')
    expect(parsed.items[0].password).toBe('secreto')
    expect(parsed.items[0].url).toBe('https://github.com')
  })

  /*
   * LO QUE NO CABE NO SE PIERDE. Es la peor forma en que esto puede fallar: el
   * usuario ve «importado», borra el origen, y meses después descubre que su TOTP no
   * estaba. Se conserva en las notas, etiquetado, y se dice cuántos campos se han
   * movido.
   */
  it('conserva en las notas lo que no cabe, y dice qué ha movido', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.items[0].notas).toContain('unas notas')
    expect(parsed.items[0].notas).toContain('login_totp: JBSWY3DPEHPK3PXP')
    expect(parsed.items[0].notas).toContain('folder: Trabajo')
    expect(parsed.movedFields).toContain('login_totp')
    expect(parsed.movedFields).toContain('folder')
  })
})

describe('lo que no se entiende', () => {
  it('falla explícitamente si no reconoce las cabeceras', async () => {
    await expect(parseImportFile('una,cosa,cualquiera\n1,2,3')).rejects.toMatchObject({
      problem: 'formato-desconocido',
    })
  })

  it('falla con un fichero vacío', async () => {
    await expect(parseImportFile('   ')).rejects.toMatchObject({ problem: 'fichero-vacio' })
  })

  it('descarta las filas sin nombre y las cuenta', async () => {
    const parsed = await parseImportFile('name,url,username,password\n,https://x.com,ada,secreto\nBueno,,,')

    expect(parsed.items).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
  })

  it('recorta lo que pasa de los topes del esquema', async () => {
    const long = 'x'.repeat(900)
    const parsed = await parseImportFile(`name,url,username,password\n${long},,,`)

    expect(parsed.items[0].nombre).toHaveLength(500)
  })
})

/*
 * Los repetidos se avisan pero no se deciden: no hay identificador estable entre dos
 * instancias, así que «el mismo item» es una heurística, y una heurística que se
 * equivoca hacia el lado de fusionar pierde datos en silencio.
 */
describe('detectar repetidos', () => {
  it('señala los que coinciden en nombre y usuario', () => {
    const existing: ItemContent[] = [{ nombre: 'GitHub', usuario: 'ada' }]
    const incoming: ItemContent[] = [
      { nombre: 'GitHub', usuario: 'ada' },
      { nombre: 'GitHub', usuario: 'otra' },
      { nombre: 'Banco', usuario: 'ada' },
    ]

    expect([...findDuplicates(incoming, existing)]).toEqual([0])
  })

  it('no señala nada cuando la vault está vacía', () => {
    expect(findDuplicates([{ nombre: 'GitHub' }], []).size).toBe(0)
  })
})
