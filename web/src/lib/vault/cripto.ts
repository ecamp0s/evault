/**
 * AQUÍ SÍ SE CIFRA.
 *
 * La primitiva criptográfica del cliente, y el único sitio del proyecto donde se
 * deriva una clave o se llama a `crypto.subtle`. No conoce React, ni la API, ni el
 * contrato de los endpoints: recibe texto y claves, y devuelve texto y claves.
 *
 * Lo que implementa está decidido y argumentado en ADR-008. En una línea: PBKDF2
 * deriva de la contraseña maestra una clave maestra que NO cifra ningún item, sino
 * que envuelve una clave de vault aleatoria, y es esa la que cifra el contenido.
 *
 * Aviso que gobierna cualquier cambio en este fichero, de ADR-001: el coste de un
 * bug aquí es pérdida de datos irreversible, no un error recuperable. Nadie puede
 * recuperar lo que solo el usuario podía descifrar, ni siquiera el operador del
 * servicio. Cada propiedad de la que depende esa garantía tiene su test en
 * cripto.test.ts, y esos tests no son documentación: son la red.
 */

/**
 * Iteraciones de PBKDF2-HMAC-SHA256.
 *
 * 600.000 es la recomendación explícita de OWASP para esta combinación, no un
 * mínimo tolerado. Que la derivación tarde un tiempo perceptible es el efecto
 * buscado y no un problema de rendimiento que optimizar: es lo que le cuesta a
 * quien pruebe contraseñas a ciegas.
 *
 * Subir este número no es un cambio local. Los parámetros viven en el cliente y no
 * en el servidor, así que cambiarlo aquí deja fuera a todo usuario ya registrado.
 * Ver la consecuencia 1 de ADR-008.
 */
export const ITERACIONES = 600_000

/** Tamaño de las claves y del material derivado. AES-256 y SHA-256. */
export const BITS_DE_CLAVE = 256

/**
 * 96 bits, que es el tamaño de nonce recomendado para AES-GCM.
 *
 * Con IV aleatorio de este tamaño, el riesgo de repetir uno con la misma clave
 * empieza a importar del orden de las 2^32 escrituras. Una vault real no se acerca,
 * pero el número conviene tenerlo escrito antes que descubrirlo.
 */
export const BYTES_DE_IV = 12

/** Versión del esquema criptográfico. La 1 era la codificación sin cifrar. */
export const VERSION_CIFRADO = 2

/**
 * Algo cifrado, listo para viajar: los bytes y el nonce con que se produjeron.
 *
 * Los nombres son neutros a propósito. Sirve tanto para el contenido de un item,
 * que la API llama `ciphertext`, como para la clave de vault envuelta, que es otro
 * campo. Traducir a los nombres del contrato es trabajo de quien llama.
 *
 * No hay campo para la etiqueta de autenticación de GCM: `crypto.subtle` la
 * concatena al final de los datos. Añadirle un campo propio sería un error, y está
 * avisado también en FOUNDATION.md.
 */
export interface Cifrado {
  /** Los bytes cifrados, en base64. */
  datos: string
  /** El nonce, en base64. */
  iv: string
}

/** Lo que sale de la contraseña maestra: una clave que no viaja y un hash que sí. */
export interface ClavesDerivadas {
  /**
   * Envuelve y desenvuelve la clave de vault. No cifra items y no sale del
   * dispositivo. No es extraíble, así que su material no se puede volver a leer.
   */
  claveMaestra: CryptoKey
  /**
   * Lo único que viaja al servidor, en el campo `password` que ya existe. De él no
   * se puede obtener la clave maestra: quien lo capture consigue una sesión, no el
   * contenido. Ver ADR-008.
   */
  hashDeAutenticacion: string
}

/**
 * Un fallo al descifrar, distinguible de cualquier otro error.
 *
 * Existe porque la respuesta correcta ante esto nunca es seguir adelante con un
 * valor de relleno. Un descifrado que falla significa una de tres: la contraseña
 * maestra no es la que cifró esto, los datos llegaron corrompidos, o alguien los
 * manipuló por el camino. En los tres casos hay que parar y decirlo.
 */
export class ErrorDeDescifrado extends Error {
  constructor(mensaje = 'No se ha podido descifrar') {
    super(mensaje)
    this.name = 'ErrorDeDescifrado'
  }
}

/**
 * Bytes con un ArrayBuffer propio detrás.
 *
 * Desde TypeScript 5.7 `Uint8Array` es genérico sobre su buffer, y sin argumento
 * significa `Uint8Array<ArrayBufferLike>`, que incluye `SharedArrayBuffer`. Las
 * firmas de `crypto.subtle` piden `BufferSource`, que no lo incluye, así que un
 * `Uint8Array` a secas no se les puede pasar.
 *
 * El alias existe para resolverlo en la frontera —donde los bytes se crean— en vez
 * de repartir aserciones de tipo por cada llamada a la API de criptografía. Un
 * `as` aquí sería especialmente mala idea: silenciar al compilador en el módulo
 * donde un byte mal puesto es pérdida de datos es justo donde no compensa.
 */
type Bytes = Uint8Array<ArrayBuffer>

/*
 * Conversiones. btoa y atob solo manejan latin1, así que aquí se trabaja siempre
 * con bytes explícitos y nunca se les pasa una cadena de texto directamente. La
 * lección viene de la Iteración 2, donde el primer nombre con eñe habría roto el
 * guardado.
 */

function aBase64(bytes: Uint8Array): string {
  let binario = ''

  for (const byte of bytes) {
    binario += String.fromCharCode(byte)
  }

  return btoa(binario)
}

function desdeBase64(base64: string): Bytes {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)

  for (let posicion = 0; posicion < binario.length; posicion += 1) {
    bytes[posicion] = binario.charCodeAt(posicion)
  }

  return bytes
}

function aBytes(texto: string): Bytes {
  return new TextEncoder().encode(texto)
}

function aTexto(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/**
 * Normaliza el correo para usarlo como salt de la derivación.
 *
 * Es parte del contrato criptográfico y no una cortesía de la interfaz: el correo
 * ES el salt, así que cliente y servidor tienen que normalizarlo exactamente igual
 * o la derivación no coincide. El servidor aplica `mb_strtolower(trim(...))` en
 * RegisterUser y LoginUser, y esto es su equivalente.
 *
 * El fallo que evita es de los que no se ven: alguien se registra con
 * `Ada@Example.com`, entra escribiendo `ada@example.com`, obtiene otro hash de
 * autenticación y recibe «credenciales incorrectas». Todo el mundo mira entonces al
 * login, que es el único sitio donde no está el problema.
 *
 * toLowerCase y no toLocaleLowerCase, a propósito: la variante con locale convierte
 * la I mayúscula en ı sin punto bajo configuración turca, y entonces el mismo
 * correo derivaría distinto según el idioma del dispositivo.
 */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase()
}

async function importarParaDerivar(material: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
}

async function derivarBits(
  material: Bytes,
  salt: Bytes,
  iteraciones: number,
): Promise<Bytes> {
  const clave = await importarParaDerivar(material)

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    clave,
    BITS_DE_CLAVE,
  )

  return new Uint8Array(bits)
}

async function importarParaCifrar(material: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/**
 * Deriva de la contraseña maestra lo único que sale de ella: la clave maestra, que
 * se queda, y el hash de autenticación, que viaja.
 *
 * Las dos salidas se producen en una sola llamada porque la parte cara —las 600.000
 * iteraciones— es común, y porque separarlas invitaría a pedir el hash por su cuenta
 * sin saber lo que cuesta.
 *
 * El hash se deriva de la clave maestra usando la contraseña como salt. Invertir eso
 * exige invertir HMAC-SHA256, y por eso el servidor, que conoce el hash, no llega a
 * la clave.
 */
export async function derivarClaves(
  contrasenaMaestra: string,
  correo: string,
): Promise<ClavesDerivadas> {
  const bitsMaestra = await derivarBits(
    aBytes(contrasenaMaestra),
    aBytes(normalizarCorreo(correo)),
    ITERACIONES,
  )

  /*
   * Una sola iteración, y no es un descuido. El trabajo duro ya está hecho: lo que
   * entra aquí es la clave maestra, que ya costó 600.000 iteraciones, y no la
   * contraseña. Repetirlas serviría solo para doblar la espera.
   */
  const bitsHash = await derivarBits(bitsMaestra, aBytes(contrasenaMaestra), 1)

  return {
    claveMaestra: await importarParaCifrar(bitsMaestra),
    hashDeAutenticacion: aBase64(bitsHash),
  }
}

async function cifrarBytes(clave: CryptoKey, datos: Bytes): Promise<Cifrado> {
  /*
   * IV nuevo en cada llamada, sin excepción. Reutilizar un nonce con GCM no degrada
   * la seguridad, la rompe: dos mensajes con el mismo par de clave y nonce revelan
   * su XOR y comprometen la clave de autenticación. Es el fallo clásico de esta
   * primitiva y por eso el IV se genera aquí dentro, donde nadie puede pasarlo.
   */
  const iv = crypto.getRandomValues(new Uint8Array(BYTES_DE_IV))

  const cifrados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos)

  return { datos: aBase64(new Uint8Array(cifrados)), iv: aBase64(iv) }
}

async function descifrarBytes(clave: CryptoKey, cifrado: Cifrado): Promise<Bytes> {
  try {
    const claros = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: desdeBase64(cifrado.iv) },
      clave,
      desdeBase64(cifrado.datos),
    )

    return new Uint8Array(claros)
  } catch {
    /*
     * Se traga el error original a propósito. Llega aquí tanto un OperationError de
     * la etiqueta de GCM que no valida —contraseña equivocada o datos manipulados—
     * como un base64 que no se puede decodificar. Distinguirlos hacia fuera no
     * ayudaría a quien llama y sí le diría a un atacante cuál de sus dos hipótesis
     * era la buena.
     */
    throw new ErrorDeDescifrado()
  }
}

/**
 * Crea la clave que cifra el contenido de una vault, y su envoltorio.
 *
 * La clave se genera aquí, se envuelve aquí y se importa aquí, de modo que su
 * material en claro no llega a salir del módulo ni un momento. Quien llama recibe
 * una clave que puede usar pero no leer, y un blob que puede guardar pero no abrir.
 */
export async function crearClaveDeVault(
  claveMaestra: CryptoKey,
): Promise<{ claveDeVault: CryptoKey; envoltorio: Cifrado }> {
  const material = crypto.getRandomValues(new Uint8Array(BITS_DE_CLAVE / 8))

  return {
    claveDeVault: await importarParaCifrar(material),
    envoltorio: await cifrarBytes(claveMaestra, material),
  }
}

/**
 * Abre el envoltorio y devuelve la clave de la vault, lista para usar.
 *
 * Falla con ErrorDeDescifrado si la clave maestra no es la que envolvió esto, que
 * en la práctica significa que la contraseña maestra no es la correcta. Es el punto
 * donde el desbloqueo de la vault se acepta o se rechaza.
 */
export async function abrirClaveDeVault(
  claveMaestra: CryptoKey,
  envoltorio: Cifrado,
): Promise<CryptoKey> {
  return importarParaCifrar(await descifrarBytes(claveMaestra, envoltorio))
}

/** Cifra el contenido de un item con la clave de la vault. */
export async function cifrar(claveDeVault: CryptoKey, texto: string): Promise<Cifrado> {
  return cifrarBytes(claveDeVault, aBytes(texto))
}

/** Descifra el contenido de un item. Lanza ErrorDeDescifrado si no puede. */
export async function descifrar(claveDeVault: CryptoKey, cifrado: Cifrado): Promise<string> {
  return aTexto(await descifrarBytes(claveDeVault, cifrado))
}
