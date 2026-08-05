import { beforeAll, describe, expect, it } from 'vitest'
import {
  IV_BYTES,
  type Encrypted,
  type DerivedKeys,
  DecryptionError,
  ITERATIONS,
  CIPHER_VERSION,
  openVaultKey,
  encrypt,
  createVaultKey,
  deriveKeys,
  decrypt,
  normalizeEmail,
} from './crypto'

/*
 * Estos tests son la red de la que habla ADR-001: el coste de un bug en crypto.ts
 * es pérdida de datos irreversible, no un error recuperable. Cada bloque de abajo
 * vigila una propiedad concreta de la que depende esa garantía, y si alguno empieza
 * a fallar la pregunta no es cómo hacerlo pasar, sino qué garantía se ha roto.
 *
 * Sobre la lentitud: derivar cuesta 600.000 iteraciones a propósito, así que todas
 * las derivaciones se hacen una vez en beforeAll y se reparten entre los tests. Si
 * este fichero se vuelve lento, la salida es reutilizar más, nunca bajar ITERACIONES.
 */

const CORREO = 'ada@example.com'
const MAESTRA = 'una contraseña maestra razonablemente larga'
const OTRA_MAESTRA = 'otra contraseña maestra completamente distinta'

let queryKeys: DerivedKeys
let mismasClaves: DerivedKeys
let clavesConOtraMaestra: DerivedKeys
let clavesConCorreoSucio: DerivedKeys
let clavesConOtroCorreo: DerivedKeys
let vaultKey: CryptoKey
let wrapped: Encrypted

beforeAll(async () => {
  ;[queryKeys, mismasClaves, clavesConOtraMaestra, clavesConCorreoSucio, clavesConOtroCorreo] =
    await Promise.all([
      deriveKeys(MAESTRA, CORREO),
      deriveKeys(MAESTRA, CORREO),
      deriveKeys(OTRA_MAESTRA, CORREO),
      deriveKeys(MAESTRA, '  Ada@Example.COM  '),
      deriveKeys(MAESTRA, 'grace@example.com'),
    ])

  const vault = await createVaultKey(queryKeys.masterKey)

  vaultKey = vault.vaultKey
  wrapped = vault.wrapped
}, 60_000)

/** Cambia un carácter del base64, que es lo que haría un atacante o un disco malo. */
function manipular(encrypted: Encrypted, campo: keyof Encrypted = 'data'): Encrypted {
  const original = encrypted[campo]
  const position = 2

  return {
    ...encrypted,
    [campo]:
      original.slice(0, position) +
      (original[position] === 'A' ? 'B' : 'A') +
      original.slice(position + 1),
  }
}

/** Importa unos bytes cualesquiera como clave AES, para probar que NO abren algo. */
async function comoClave(base64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))

  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

describe('parámetros del esquema', () => {
  /*
   * No es un test de que 600.000 sea el número correcto, que eso es criterio humano
   * y vive en ADR-008. Es un test de que nadie lo baje sin querer, por ejemplo para
   * que la suite corra más rápido, que es la tentación evidente.
   */
  it('las iteraciones son las que ADR-008 fija', () => {
    expect(ITERATIONS).toBe(600_000)
  })

  it('el nonce es de 96 bits, el tamaño recomendado para AES-GCM', () => {
    expect(IV_BYTES).toBe(12)
  })

  it('la versión del esquema distingue el cifrado de la codificación anterior', () => {
    expect(CIPHER_VERSION).toBe(2)
  })
})

describe('normalización del correo', () => {
  it('quita espacios y baja a minúsculas', () => {
    expect(normalizeEmail('  Ada@Example.COM  ')).toBe('ada@example.com')
  })

  /*
   * El servidor normaliza con mb_strtolower(trim(...)) y el cliente deriva antes de
   * enviar nada, así que las dos normalizaciones tienen que coincidir o el usuario
   * no entra. Esto lo comprueba de punta a punta: el mismo correo escrito de dos
   * maneras tiene que producir el mismo hash de autenticación.
   */
  it('el correo escrito de otra forma deriva exactamente lo mismo', () => {
    expect(clavesConCorreoSucio.authHash).toBe(queryKeys.authHash)
  })

  it('un correo distinto deriva algo distinto, porque es el salt', () => {
    expect(clavesConOtroCorreo.authHash).not.toBe(queryKeys.authHash)
  })
})

describe('derivación de claves', () => {
  it('la misma contraseña y el mismo correo derivan siempre lo mismo', () => {
    expect(mismasClaves.authHash).toBe(queryKeys.authHash)
  })

  it('dos contraseñas distintas derivan hashes distintos', () => {
    expect(clavesConOtraMaestra.authHash).not.toBe(queryKeys.authHash)
  })

  it('el hash de autenticación son 256 bits en base64', () => {
    expect(atob(queryKeys.authHash)).toHaveLength(32)
  })

  /*
   * ADR-007 prohíbe persistir la clave incluso como CryptoKey no extraíble, pero que
   * no sea extraíble sigue importando: impide que un XSS lea el material y se lo
   * lleve para descifrar más tarde, fuera de la pestaña.
   */
  it('la clave maestra no es extraíble', async () => {
    expect(queryKeys.masterKey.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', queryKeys.masterKey)).rejects.toThrow()
  })

  /*
   * La propiedad que ADR-001 exige por escrito y que ADR-008 argumenta: el servidor
   * conoce el hash de autenticación y con él no puede abrir nada. Se comprueba
   * usándolo como si fuera la clave maestra, que es exactamente lo que intentaría
   * quien lo capturase.
   */
  it('el hash que viaja al servidor no abre la vault', async () => {
    await expect(
      openVaultKey(await comoClave(queryKeys.authHash), wrapped),
    ).rejects.toBeInstanceOf(DecryptionError)
  })
})

describe('la clave de vault y su envoltorio', () => {
  it('la clave maestra correcta abre el envoltorio', async () => {
    const abierta = await openVaultKey(queryKeys.masterKey, wrapped)
    const encrypted = await encrypt(vaultKey, 'lo de siempre')

    expect(await decrypt(abierta, encrypted)).toBe('lo de siempre')
  })

  /*
   * Es el caso del login que sale bien y el desbloqueo que sale mal: credenciales
   * correctas contra un envoltorio que esa contraseña no envolvió. Tiene que ser
   * distinguible, porque la interfaz dice cosas distintas en cada caso.
   */
  it('otra contraseña maestra no abre el envoltorio', async () => {
    await expect(
      openVaultKey(clavesConOtraMaestra.masterKey, wrapped),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  it('la clave de vault no es extraíble', async () => {
    expect(vaultKey.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', vaultKey)).rejects.toThrow()
  })

  /*
   * Dos vaults creadas con la misma clave maestra tienen claves distintas. Si esto
   * fallara, la clave de vault estaría derivándose en vez de generándose al azar, y
   * se habría perdido justo lo que ADR-008 compra con ella.
   */
  it('cada vault recibe una clave propia', async () => {
    const otra = await createVaultKey(queryKeys.masterKey)
    const cifradoConLaPrimera = await encrypt(vaultKey, 'secreto')

    expect(otra.wrapped.data).not.toBe(wrapped.data)
    await expect(decrypt(otra.vaultKey, cifradoConLaPrimera)).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })
})

describe('cifrar y descifrar el contenido', () => {
  it('el ciclo completo devuelve el mismo texto', async () => {
    const text = JSON.stringify({ nombre: 'GitHub', password: 'secreto' })

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })

  /*
   * La herencia directa de la lección de btoa de la Iteración 2: el primer nombre
   * con eñe habría roto el guardado. Aquí se pasa por UTF-8 explícito en los dos
   * sentidos, y esto es lo que lo fija.
   */
  it('sobrevive a acentos, emoji y alfabetos no latinos', async () => {
    const text = 'Correo del año 漢字 · añoñó@example.com · çontraseña-🔐-ñ · Ω≈ç√∫˜µ'

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })

  it('sobrevive a un texto vacío', async () => {
    expect(await decrypt(vaultKey, await encrypt(vaultKey, ''))).toBe('')
  })

  it('sobrevive a un texto largo', async () => {
    const text = 'ñ🔐'.repeat(20_000)

    expect(await decrypt(vaultKey, await encrypt(vaultKey, text))).toBe(text)
  })
})

describe('el nonce nunca se reutiliza', () => {
  /*
   * El fallo clásico de AES-GCM, y el más grave que se puede cometer con esta
   * primitiva: dos mensajes cifrados con el mismo par de clave y nonce revelan su
   * XOR y comprometen la clave de autenticación. No degrada la seguridad, la rompe.
   */
  it('cifrar dos veces lo mismo produce dos nonces distintos', async () => {
    const primero = await encrypt(vaultKey, 'el mismo texto exacto')
    const segundo = await encrypt(vaultKey, 'el mismo texto exacto')

    expect(primero.iv).not.toBe(segundo.iv)
  })

  it('cifrar dos veces lo mismo produce dos textos cifrados distintos', async () => {
    const primero = await encrypt(vaultKey, 'el mismo texto exacto')
    const segundo = await encrypt(vaultKey, 'el mismo texto exacto')

    expect(primero.data).not.toBe(segundo.data)
  })

  /*
   * Sobre una muestra, no sobre dos: un generador roto que devolviera siempre el
   * mismo valor pasaría desapercibido en un par de comparaciones si tuviera algún
   * estado, y aquí no hay margen para «casi siempre distinto».
   */
  it('cien cifrados producen cien nonces distintos', async () => {
    const encryptedBytes = await Promise.all(
      Array.from({ length: 100 }, () => encrypt(vaultKey, 'igual')),
    )

    expect(new Set(encryptedBytes.map(({ iv }) => iv)).size).toBe(100)
  })

  it('el nonce ocupa los 96 bits declarados', async () => {
    const { iv } = await encrypt(vaultKey, 'lo que sea')

    expect(atob(iv)).toHaveLength(IV_BYTES)
  })
})

describe('ante datos que no puede descifrar', () => {
  /*
   * Lo que protege la etiqueta de autenticación de GCM. Sin ella, alterar el texto
   * cifrado produciría un descifrado con basura dentro en vez de un error, y esa
   * basura acabaría guardada encima de los datos buenos.
   */
  it('un texto cifrado manipulado falla en vez de devolver basura', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(decrypt(vaultKey, manipular(encrypted))).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('un nonce manipulado falla', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(decrypt(vaultKey, manipular(encrypted, 'iv'))).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('un texto cifrado truncado falla', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    await expect(
      decrypt(vaultKey, { ...encrypted, data: encrypted.data.slice(0, 8) }),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  /*
   * Un base64 inválido no llega a la primitiva: revienta antes, al decodificar. Sale
   * igualmente como ErrorDeDescifrado para que quien llama tenga un solo error que
   * tratar, y no un DOMException colándose por otro camino.
   */
  it('algo que ni siquiera es base64 falla como error de descifrado', async () => {
    await expect(
      decrypt(vaultKey, { data: '!!! no es base64 !!!', iv: 'tampoco' }),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  /*
   * El mensaje no distingue entre contraseña equivocada, datos corruptos y datos
   * manipulados. Es deliberado: quien llama no puede hacer nada distinto en cada
   * caso, y decirlo le confirmaría a un atacante cuál de sus hipótesis era la buena.
   */
  it('el error no revela cuál de las causas posibles ha sido', async () => {
    const encrypted = await encrypt(vaultKey, 'contenido legítimo')

    const deLaManipulacion = await decrypt(vaultKey, manipular(encrypted)).catch(
      (error: unknown) => error,
    )
    const deLaClaveMala = await openVaultKey(
      clavesConOtraMaestra.masterKey,
      wrapped,
    ).catch((error: unknown) => error)

    expect((deLaManipulacion as Error).message).toBe((deLaClaveMala as Error).message)
  })
})
