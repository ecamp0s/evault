import { beforeAll, describe, expect, it } from 'vitest'
import {
  BYTES_DE_IV,
  type Cifrado,
  type ClavesDerivadas,
  ErrorDeDescifrado,
  ITERACIONES,
  VERSION_CIFRADO,
  abrirClaveDeVault,
  cifrar,
  crearClaveDeVault,
  derivarClaves,
  descifrar,
  normalizarCorreo,
} from './cripto'

/*
 * Estos tests son la red de la que habla ADR-001: el coste de un bug en cripto.ts
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

let claves: ClavesDerivadas
let mismasClaves: ClavesDerivadas
let clavesConOtraMaestra: ClavesDerivadas
let clavesConCorreoSucio: ClavesDerivadas
let clavesConOtroCorreo: ClavesDerivadas
let claveDeVault: CryptoKey
let envoltorio: Cifrado

beforeAll(async () => {
  ;[claves, mismasClaves, clavesConOtraMaestra, clavesConCorreoSucio, clavesConOtroCorreo] =
    await Promise.all([
      derivarClaves(MAESTRA, CORREO),
      derivarClaves(MAESTRA, CORREO),
      derivarClaves(OTRA_MAESTRA, CORREO),
      derivarClaves(MAESTRA, '  Ada@Example.COM  '),
      derivarClaves(MAESTRA, 'grace@example.com'),
    ])

  const vault = await crearClaveDeVault(claves.claveMaestra)

  claveDeVault = vault.claveDeVault
  envoltorio = vault.envoltorio
}, 60_000)

/** Cambia un carácter del base64, que es lo que haría un atacante o un disco malo. */
function manipular(cifrado: Cifrado, campo: keyof Cifrado = 'datos'): Cifrado {
  const original = cifrado[campo]
  const posicion = 2

  return {
    ...cifrado,
    [campo]:
      original.slice(0, posicion) +
      (original[posicion] === 'A' ? 'B' : 'A') +
      original.slice(posicion + 1),
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
    expect(ITERACIONES).toBe(600_000)
  })

  it('el nonce es de 96 bits, el tamaño recomendado para AES-GCM', () => {
    expect(BYTES_DE_IV).toBe(12)
  })

  it('la versión del esquema distingue el cifrado de la codificación anterior', () => {
    expect(VERSION_CIFRADO).toBe(2)
  })
})

describe('normalización del correo', () => {
  it('quita espacios y baja a minúsculas', () => {
    expect(normalizarCorreo('  Ada@Example.COM  ')).toBe('ada@example.com')
  })

  /*
   * El servidor normaliza con mb_strtolower(trim(...)) y el cliente deriva antes de
   * enviar nada, así que las dos normalizaciones tienen que coincidir o el usuario
   * no entra. Esto lo comprueba de punta a punta: el mismo correo escrito de dos
   * maneras tiene que producir el mismo hash de autenticación.
   */
  it('el correo escrito de otra forma deriva exactamente lo mismo', () => {
    expect(clavesConCorreoSucio.hashDeAutenticacion).toBe(claves.hashDeAutenticacion)
  })

  it('un correo distinto deriva algo distinto, porque es el salt', () => {
    expect(clavesConOtroCorreo.hashDeAutenticacion).not.toBe(claves.hashDeAutenticacion)
  })
})

describe('derivación de claves', () => {
  it('la misma contraseña y el mismo correo derivan siempre lo mismo', () => {
    expect(mismasClaves.hashDeAutenticacion).toBe(claves.hashDeAutenticacion)
  })

  it('dos contraseñas distintas derivan hashes distintos', () => {
    expect(clavesConOtraMaestra.hashDeAutenticacion).not.toBe(claves.hashDeAutenticacion)
  })

  it('el hash de autenticación son 256 bits en base64', () => {
    expect(atob(claves.hashDeAutenticacion)).toHaveLength(32)
  })

  /*
   * ADR-007 prohíbe persistir la clave incluso como CryptoKey no extraíble, pero que
   * no sea extraíble sigue importando: impide que un XSS lea el material y se lo
   * lleve para descifrar más tarde, fuera de la pestaña.
   */
  it('la clave maestra no es extraíble', async () => {
    expect(claves.claveMaestra.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', claves.claveMaestra)).rejects.toThrow()
  })

  /*
   * La propiedad que ADR-001 exige por escrito y que ADR-008 argumenta: el servidor
   * conoce el hash de autenticación y con él no puede abrir nada. Se comprueba
   * usándolo como si fuera la clave maestra, que es exactamente lo que intentaría
   * quien lo capturase.
   */
  it('el hash que viaja al servidor no abre la vault', async () => {
    await expect(
      abrirClaveDeVault(await comoClave(claves.hashDeAutenticacion), envoltorio),
    ).rejects.toBeInstanceOf(ErrorDeDescifrado)
  })
})

describe('la clave de vault y su envoltorio', () => {
  it('la clave maestra correcta abre el envoltorio', async () => {
    const abierta = await abrirClaveDeVault(claves.claveMaestra, envoltorio)
    const cifrado = await cifrar(claveDeVault, 'lo de siempre')

    expect(await descifrar(abierta, cifrado)).toBe('lo de siempre')
  })

  /*
   * Es el caso del login que sale bien y el desbloqueo que sale mal: credenciales
   * correctas contra un envoltorio que esa contraseña no envolvió. Tiene que ser
   * distinguible, porque la interfaz dice cosas distintas en cada caso.
   */
  it('otra contraseña maestra no abre el envoltorio', async () => {
    await expect(
      abrirClaveDeVault(clavesConOtraMaestra.claveMaestra, envoltorio),
    ).rejects.toBeInstanceOf(ErrorDeDescifrado)
  })

  it('la clave de vault no es extraíble', async () => {
    expect(claveDeVault.extractable).toBe(false)

    await expect(crypto.subtle.exportKey('raw', claveDeVault)).rejects.toThrow()
  })

  /*
   * Dos vaults creadas con la misma clave maestra tienen claves distintas. Si esto
   * fallara, la clave de vault estaría derivándose en vez de generándose al azar, y
   * se habría perdido justo lo que ADR-008 compra con ella.
   */
  it('cada vault recibe una clave propia', async () => {
    const otra = await crearClaveDeVault(claves.claveMaestra)
    const cifradoConLaPrimera = await cifrar(claveDeVault, 'secreto')

    expect(otra.envoltorio.datos).not.toBe(envoltorio.datos)
    await expect(descifrar(otra.claveDeVault, cifradoConLaPrimera)).rejects.toBeInstanceOf(
      ErrorDeDescifrado,
    )
  })
})

describe('cifrar y descifrar el contenido', () => {
  it('el ciclo completo devuelve el mismo texto', async () => {
    const texto = JSON.stringify({ nombre: 'GitHub', password: 'secreto' })

    expect(await descifrar(claveDeVault, await cifrar(claveDeVault, texto))).toBe(texto)
  })

  /*
   * La herencia directa de la lección de btoa de la Iteración 2: el primer nombre
   * con eñe habría roto el guardado. Aquí se pasa por UTF-8 explícito en los dos
   * sentidos, y esto es lo que lo fija.
   */
  it('sobrevive a acentos, emoji y alfabetos no latinos', async () => {
    const texto = 'Correo del año 漢字 · añoñó@example.com · çontraseña-🔐-ñ · Ω≈ç√∫˜µ'

    expect(await descifrar(claveDeVault, await cifrar(claveDeVault, texto))).toBe(texto)
  })

  it('sobrevive a un texto vacío', async () => {
    expect(await descifrar(claveDeVault, await cifrar(claveDeVault, ''))).toBe('')
  })

  it('sobrevive a un texto largo', async () => {
    const texto = 'ñ🔐'.repeat(20_000)

    expect(await descifrar(claveDeVault, await cifrar(claveDeVault, texto))).toBe(texto)
  })
})

describe('el nonce nunca se reutiliza', () => {
  /*
   * El fallo clásico de AES-GCM, y el más grave que se puede cometer con esta
   * primitiva: dos mensajes cifrados con el mismo par de clave y nonce revelan su
   * XOR y comprometen la clave de autenticación. No degrada la seguridad, la rompe.
   */
  it('cifrar dos veces lo mismo produce dos nonces distintos', async () => {
    const primero = await cifrar(claveDeVault, 'el mismo texto exacto')
    const segundo = await cifrar(claveDeVault, 'el mismo texto exacto')

    expect(primero.iv).not.toBe(segundo.iv)
  })

  it('cifrar dos veces lo mismo produce dos textos cifrados distintos', async () => {
    const primero = await cifrar(claveDeVault, 'el mismo texto exacto')
    const segundo = await cifrar(claveDeVault, 'el mismo texto exacto')

    expect(primero.datos).not.toBe(segundo.datos)
  })

  /*
   * Sobre una muestra, no sobre dos: un generador roto que devolviera siempre el
   * mismo valor pasaría desapercibido en un par de comparaciones si tuviera algún
   * estado, y aquí no hay margen para «casi siempre distinto».
   */
  it('cien cifrados producen cien nonces distintos', async () => {
    const cifrados = await Promise.all(
      Array.from({ length: 100 }, () => cifrar(claveDeVault, 'igual')),
    )

    expect(new Set(cifrados.map(({ iv }) => iv)).size).toBe(100)
  })

  it('el nonce ocupa los 96 bits declarados', async () => {
    const { iv } = await cifrar(claveDeVault, 'lo que sea')

    expect(atob(iv)).toHaveLength(BYTES_DE_IV)
  })
})

describe('ante datos que no puede descifrar', () => {
  /*
   * Lo que protege la etiqueta de autenticación de GCM. Sin ella, alterar el texto
   * cifrado produciría un descifrado con basura dentro en vez de un error, y esa
   * basura acabaría guardada encima de los datos buenos.
   */
  it('un texto cifrado manipulado falla en vez de devolver basura', async () => {
    const cifrado = await cifrar(claveDeVault, 'contenido legítimo')

    await expect(descifrar(claveDeVault, manipular(cifrado))).rejects.toBeInstanceOf(
      ErrorDeDescifrado,
    )
  })

  it('un nonce manipulado falla', async () => {
    const cifrado = await cifrar(claveDeVault, 'contenido legítimo')

    await expect(descifrar(claveDeVault, manipular(cifrado, 'iv'))).rejects.toBeInstanceOf(
      ErrorDeDescifrado,
    )
  })

  it('un texto cifrado truncado falla', async () => {
    const cifrado = await cifrar(claveDeVault, 'contenido legítimo')

    await expect(
      descifrar(claveDeVault, { ...cifrado, datos: cifrado.datos.slice(0, 8) }),
    ).rejects.toBeInstanceOf(ErrorDeDescifrado)
  })

  /*
   * Un base64 inválido no llega a la primitiva: revienta antes, al decodificar. Sale
   * igualmente como ErrorDeDescifrado para que quien llama tenga un solo error que
   * tratar, y no un DOMException colándose por otro camino.
   */
  it('algo que ni siquiera es base64 falla como error de descifrado', async () => {
    await expect(
      descifrar(claveDeVault, { datos: '!!! no es base64 !!!', iv: 'tampoco' }),
    ).rejects.toBeInstanceOf(ErrorDeDescifrado)
  })

  /*
   * El mensaje no distingue entre contraseña equivocada, datos corruptos y datos
   * manipulados. Es deliberado: quien llama no puede hacer nada distinto en cada
   * caso, y decirlo le confirmaría a un atacante cuál de sus hipótesis era la buena.
   */
  it('el error no revela cuál de las causas posibles ha sido', async () => {
    const cifrado = await cifrar(claveDeVault, 'contenido legítimo')

    const deLaManipulacion = await descifrar(claveDeVault, manipular(cifrado)).catch(
      (error: unknown) => error,
    )
    const deLaClaveMala = await abrirClaveDeVault(
      clavesConOtraMaestra.claveMaestra,
      envoltorio,
    ).catch((error: unknown) => error)

    expect((deLaManipulacion as Error).message).toBe((deLaClaveMala as Error).message)
  })
})
