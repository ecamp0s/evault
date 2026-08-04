import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { EXPORT_FORMAT, type ExportFile } from '@/lib/vault/export'
import { MAX_NOTES, MAX_SHORT } from '@/lib/vault/schema'
import type { ItemContent } from '@/lib/vault/types'

/**
 * Meter entradas en eVault desde un fichero. Ver ADR-011.
 *
 * Todo ocurre en el cliente: el fichero se lee aquí, se descifra aquí si hace falta,
 * y cada entrada se cifra aquí antes de salir. El fichero de origen NO viaja al
 * servidor en ningún momento, ni siquiera para «validar el formato», y hay un test
 * que lo comprueba.
 */

/** Formatos que se saben leer. */
export type ImportFormat = 'evault' | 'chrome' | 'bitwarden'

/** Lo que se ha entendido del fichero, antes de escribir nada. */
export interface ImportPreview {
  format: ImportFormat
  items: ItemContent[]
  /** Campos que no caben en el esquema y se han conservado en las notas. */
  movedFields: string[]
  /** Filas que se han descartado por no tener ni nombre. */
  skipped: number
}

export type ImportProblem =
  | 'formato-desconocido'
  | 'passphrase-incorrecta'
  | 'version-desconocida'
  | 'fichero-vacio'

export class ImportError extends Error {
  readonly problem: ImportProblem

  constructor(problem: ImportProblem) {
    super(problem)
    this.name = 'ImportError'
    this.problem = problem
  }
}

/**
 * Un CSV, respetando comillas y saltos de línea dentro de los campos.
 *
 * Se escribe a mano en vez de traer una dependencia porque el CSV que hay que leer
 * es el que escriben tres programas concretos, no el universo de CSV posibles. Y un
 * parser mal hecho aquí no da un error: parte un campo en dos y mete una contraseña
 * en la columna equivocada.
 */
function parseCsv(text: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]

    if (entreComillas) {
      if (c === '"') {
        // Dos comillas seguidas son una comilla literal, no el fin del campo.
        if (text[i + 1] === '"') {
          campo += '"'
          i += 1
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }

      continue
    }

    if (c === '"') {
      entreComillas = true
    } else if (c === ',') {
      fila.push(campo)
      campo = ''
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else if (c !== '\r') {
      campo += c
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas.filter((f) => f.some((valor) => valor !== ''))
}

/** Columnas por las que se reconoce cada programa. */
const CABECERAS: Record<Exclude<ImportFormat, 'evault'>, string[]> = {
  chrome: ['name', 'url', 'username', 'password'],
  bitwarden: ['name', 'login_username', 'login_password'],
}

/** Qué columna va a qué campo del item. Lo demás se conserva en las notas. */
const MAPEO: Record<Exclude<ImportFormat, 'evault'>, Record<string, keyof ItemContent>> = {
  chrome: { name: 'nombre', url: 'url', username: 'usuario', password: 'password', note: 'notas' },
  bitwarden: {
    name: 'nombre',
    login_uri: 'url',
    login_username: 'usuario',
    login_password: 'password',
    notes: 'notas',
  },
}

function recortar(valor: string, tope: number): string {
  return valor.length > tope ? valor.slice(0, tope) : valor
}

/**
 * Convierte una fila en un item, conservando lo que no cabe.
 *
 * Lo que no encaja en los cinco campos NO se descarta: se añade a las notas con su
 * nombre delante. Perder datos en una migración sin decirlo es la peor forma en que
 * esta funcionalidad puede fallar, porque el usuario ve «importado» y borra el
 * origen. Ver ADR-011.
 */
function aItem(
  cabeceras: string[],
  fila: string[],
  formato: Exclude<ImportFormat, 'evault'>,
  movidos: Set<string>,
): ItemContent | null {
  const mapeo = MAPEO[formato]
  const item: ItemContent = { nombre: '' }
  const extras: string[] = []

  cabeceras.forEach((cabecera, indice) => {
    const valor = (fila[indice] ?? '').trim()

    if (valor === '') return

    const destino = mapeo[cabecera]

    if (destino) {
      item[destino] = valor

      return
    }

    extras.push(`${cabecera}: ${valor}`)
    movidos.add(cabecera)
  })

  if (!item.nombre) return null

  if (extras.length > 0) {
    const cabeceraExtras = 'Importado de otro gestor:'
    item.notas = [item.notas, cabeceraExtras, ...extras].filter(Boolean).join('\n')
  }

  // Los topes del esquema aplican igual: lo que no valide el cliente no lo valida
  // nadie, y un import masivo es su prueba de esfuerzo.
  item.nombre = recortar(item.nombre, MAX_SHORT)
  if (item.usuario) item.usuario = recortar(item.usuario, MAX_SHORT)
  if (item.password) item.password = recortar(item.password, MAX_SHORT)
  if (item.url) item.url = recortar(item.url, MAX_SHORT)
  if (item.notas) item.notas = recortar(item.notas, MAX_NOTES)

  return item
}

/**
 * Lee un fichero y dice qué ha entendido, sin escribir nada.
 *
 * Nunca adivina: si no reconoce las cabeceras, falla diciéndolo. Un import que
 * interpreta mal las columnas mete contraseñas donde van los nombres, y eso se
 * descubre tarde.
 */
export async function parseImportFile(text: string, passphrase?: string): Promise<ImportPreview> {
  const contenido = text.trim()

  if (contenido === '') throw new ImportError('fichero-vacio')

  // El formato propio se reconoce por su cabecera, no por la extensión.
  if (contenido.startsWith('{')) {
    let file: ExportFile

    try {
      file = JSON.parse(contenido) as ExportFile
    } catch {
      throw new ImportError('formato-desconocido')
    }

    if (file.format !== EXPORT_FORMAT) throw new ImportError('formato-desconocido')

    /*
     * La versión se comprueba ANTES de intentar descifrar. Un fichero de una versión
     * que no se conoce se rechaza explicándolo, en vez de intentar leerlo a ver si
     * suena. Ver ADR-011.
     */
    if (file.version !== 1) throw new ImportError('version-desconocida')

    try {
      const key = await deriveExportKey(
        passphrase ?? '',
        base64ToBytes(file.kdf.salt),
        file.kdf.iterations,
      )

      const dentro = JSON.parse(
        await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
      ) as { items: ItemContent[] }

      return { format: 'evault', items: dentro.items, movedFields: [], skipped: 0 }
    } catch {
      // Con AES-GCM, una passphrase incorrecta y un fichero manipulado son
      // indistinguibles: los dos fallan la etiqueta de autenticación.
      throw new ImportError('passphrase-incorrecta')
    }
  }

  const filas = parseCsv(contenido)

  if (filas.length < 2) throw new ImportError('fichero-vacio')

  const cabeceras = filas[0].map((c) => c.trim().toLowerCase())

  const formato = (Object.keys(CABECERAS) as Exclude<ImportFormat, 'evault'>[]).find((nombre) =>
    CABECERAS[nombre].every((columna) => cabeceras.includes(columna)),
  )

  if (!formato) throw new ImportError('formato-desconocido')

  const movidos = new Set<string>()
  const items: ItemContent[] = []
  let skipped = 0

  for (const fila of filas.slice(1)) {
    const item = aItem(cabeceras, fila, formato, movidos)

    if (item === null) {
      skipped += 1

      continue
    }

    items.push(item)
  }

  return { format: formato, items, movedFields: [...movidos], skipped }
}

/**
 * Cuáles de los que llegan parecen estar ya en la vault.
 *
 * Avisa; no decide. No hay identificador estable entre dos instancias, así que «el
 * mismo item» solo puede ser una heurística sobre nombre y usuario, y una heurística
 * que se equivoca hacia el lado de fusionar pierde datos en silencio. ADR-011 decidió
 * que el import añade siempre y que esto sirve para que el usuario deseleccione.
 */
export function findDuplicates(entrantes: ItemContent[], existentes: ItemContent[]): Set<number> {
  const clave = (item: ItemContent) => `${item.nombre.trim()} ${(item.usuario ?? '').trim()}`
  const yaEstan = new Set(existentes.map(clave))

  return new Set(
    entrantes.reduce<number[]>(
      (acc, item, indice) => (yaEstan.has(clave(item)) ? [...acc, indice] : acc),
      [],
    ),
  )
}
