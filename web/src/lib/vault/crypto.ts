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
export const ITERATIONS = 600_000

/** Tamaño de las claves y del material derivado. AES-256 y SHA-256. */
export const KEY_BITS = 256

/**
 * 96 bits, que es el tamaño de nonce recomendado para AES-GCM.
 *
 * Con IV aleatorio de este tamaño, el riesgo de repetir uno con la misma clave
 * empieza a importar del orden de las 2^32 escrituras. Una vault real no se acerca,
 * pero el número conviene tenerlo escrito antes que descubrirlo.
 */
export const IV_BYTES = 12

/** Versión del esquema criptográfico. La 1 era la codificación sin cifrar. */
export const CIPHER_VERSION = 2

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
export interface Encrypted {
  /** Los bytes cifrados, en base64. */
  data: string
  /** El nonce, en base64. */
  iv: string
}

/** Lo que sale de la contraseña maestra: una clave que no viaja y un hash que sí. */
export interface DerivedKeys {
  /**
   * Envuelve y desenvuelve la clave de vault. No cifra items y no sale del
   * dispositivo. No es extraíble, así que su material no se puede volver a leer.
   */
  masterKey: CryptoKey
  /**
   * Lo único que viaja al servidor, en el campo `password` que ya existe. De él no
   * se puede obtener la clave maestra: quien lo capture consigue una sesión, no el
   * contenido. Ver ADR-008.
   */
  authHash: string
}

/**
 * Un fallo al descifrar, distinguible de cualquier otro error.
 *
 * Existe porque la respuesta correcta ante esto nunca es seguir adelante con un
 * valor de relleno. Un descifrado que falla significa una de tres: la contraseña
 * maestra no es la que cifró esto, los datos llegaron corrompidos, o alguien los
 * manipuló por el camino. En los tres casos hay que parar y decirlo.
 */
export class DecryptionError extends Error {
  constructor(message = 'No se ha podido descifrar') {
    super(message)
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

function toBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function fromBase64(base64: string): Bytes {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let position = 0; position < binary.length; position += 1) {
    bytes[position] = binary.charCodeAt(position)
  }

  return bytes
}

function toBytes(text: string): Bytes {
  return new TextEncoder().encode(text)
}

function toText(bytes: Uint8Array): string {
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
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function importForDerivation(material: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
}

async function deriveBits(
  material: Bytes,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> {
  const key = await importForDerivation(material)

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )

  return new Uint8Array(bits)
}

async function importForEncryption(material: Bytes): Promise<CryptoKey> {
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
export async function deriveKeys(
  masterPassword: string,
  email: string,
): Promise<DerivedKeys> {
  const masterBits = await deriveBits(
    toBytes(masterPassword),
    toBytes(normalizeEmail(email)),
    ITERATIONS,
  )

  /*
   * Una sola iteración, y no es un descuido. El trabajo duro ya está hecho: lo que
   * entra aquí es la clave maestra, que ya costó 600.000 iteraciones, y no la
   * contraseña. Repetirlas serviría solo para doblar la espera.
   */
  const hashBits = await deriveBits(masterBits, toBytes(masterPassword), 1)

  return {
    masterKey: await importForEncryption(masterBits),
    authHash: toBase64(hashBits),
  }
}

async function encryptBytes(key: CryptoKey, data: Bytes): Promise<Encrypted> {
  /*
   * IV nuevo en cada llamada, sin excepción. Reutilizar un nonce con GCM no degrada
   * la seguridad, la rompe: dos mensajes con el mismo par de clave y nonce revelan
   * su XOR y comprometen la clave de autenticación. Es el fallo clásico de esta
   * primitiva y por eso el IV se genera aquí dentro, donde nadie puede pasarlo.
   */
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const encryptedBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)

  return { data: toBase64(new Uint8Array(encryptedBytes)), iv: toBase64(iv) }
}

async function decryptBytes(key: CryptoKey, encrypted: Encrypted): Promise<Bytes> {
  try {
    const plainBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(encrypted.iv) },
      key,
      fromBase64(encrypted.data),
    )

    return new Uint8Array(plainBytes)
  } catch {
    /*
     * Se traga el error original a propósito. Llega aquí tanto un OperationError de
     * la etiqueta de GCM que no valida —contraseña equivocada o datos manipulados—
     * como un base64 que no se puede decodificar. Distinguirlos hacia fuera no
     * ayudaría a quien llama y sí le diría a un atacante cuál de sus dos hipótesis
     * era la buena.
     */
    throw new DecryptionError()
  }
}

/**
 * Crea la clave que cifra el contenido de una vault, y su envoltorio.
 *
 * La clave se genera aquí, se envuelve aquí y se importa aquí, de modo que su
 * material en claro no llega a salir del módulo ni un momento. Quien llama recibe
 * una clave que puede usar pero no leer, y un blob que puede guardar pero no abrir.
 */
export async function createVaultKey(
  masterKey: CryptoKey,
): Promise<{ vaultKey: CryptoKey; wrapped: Encrypted }> {
  const material = crypto.getRandomValues(new Uint8Array(KEY_BITS / 8))

  return {
    vaultKey: await importForEncryption(material),
    wrapped: await encryptBytes(masterKey, material),
  }
}

/**
 * Abre el envoltorio y devuelve la clave de la vault, lista para usar.
 *
 * Falla con ErrorDeDescifrado si la clave maestra no es la que envolvió esto, que
 * en la práctica significa que la contraseña maestra no es la correcta. Es el punto
 * donde el desbloqueo de la vault se acepta o se rechaza.
 */
export async function openVaultKey(
  masterKey: CryptoKey,
  wrapped: Encrypted,
): Promise<CryptoKey> {
  return importForEncryption(await decryptBytes(masterKey, wrapped))
}

/** Cifra el contenido de un item con la clave de la vault. */
export async function encrypt(vaultKey: CryptoKey, text: string): Promise<Encrypted> {
  return encryptBytes(vaultKey, toBytes(text))
}

/** Descifra el contenido de un item. Lanza ErrorDeDescifrado si no puede. */
export async function decrypt(vaultKey: CryptoKey, encrypted: Encrypted): Promise<string> {
  return toText(await decryptBytes(vaultKey, encrypted))
}

/*
 * ---------------------------------------------------------------------------
 * Clave de recuperación. Ver ADR-010.
 * ---------------------------------------------------------------------------
 */

/**
 * Etiquetas de dominio de HKDF.
 *
 * Son lo que hace que de un mismo secreto salgan dos valores independientes: uno
 * envuelve la clave de vault y el otro viaja al servidor. Sin separarlos, lo que se
 * manda comprometería lo que abre.
 *
 * Llevan versión en el nombre a propósito. Si algún día cambia la derivación, la
 * etiqueta nueva produce claves distintas y los envoltorios viejos dejan de abrirse
 * en silencio; verlo escrito aquí obliga a pensar en la migración antes de tocarlo.
 */
const RECOVERY_WRAP_INFO = 'evault-recovery-wrap-v1'
const RECOVERY_AUTH_INFO = 'evault-recovery-auth-v1'

/**
 * Lo que sale de la clave de recuperación: una clave que envuelve y un hash que
 * viaja. El reparto es el mismo que el de la contraseña maestra en ADR-008.
 */
export interface RecoveryKeys {
  /** Envuelve la clave de vault. No sale del dispositivo. */
  wrapKey: CryptoKey
  /** Lo único que viaja al servidor. De él no se llega a wrapKey. */
  authHash: string
}

/**
 * Deriva de la clave de recuperación sus dos valores, con HKDF.
 *
 * HKDF y no PBKDF2, y es deliberado: lo que entra aquí no es una contraseña humana
 * sino 256 bits de crypto.getRandomValues. No hay diccionario que probar, así que
 * las 600.000 iteraciones de la contraseña maestra no comprarían nada más que
 * espera. El coste de un KDF existe para compensar entropía que falta, y aquí no
 * falta. Argumentado en ADR-010 §2.2.
 *
 * El salt es el correo normalizado, igual que en ADR-008 y por el mismo motivo: hay
 * que poder reproducir la derivación sin preguntarle nada al servidor.
 */
export async function deriveRecoveryKeys(
  recoveryKey: Bytes,
  email: string,
): Promise<RecoveryKeys> {
  const base = await crypto.subtle.importKey('raw', recoveryKey, 'HKDF', false, ['deriveBits'])
  const salt = toBytes(normalizeEmail(email))

  const expand = async (info: string): Promise<Bytes> => {
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: toBytes(info) },
      base,
      KEY_BITS,
    )

    return new Uint8Array(bits)
  }

  return {
    wrapKey: await importForEncryption(await expand(RECOVERY_WRAP_INFO)),
    authHash: toBase64(await expand(RECOVERY_AUTH_INFO)),
  }
}

/**
 * Envuelve la clave de vault por segunda vez, ahora con la clave de recuperación.
 *
 * Recibe el envoltorio normal y la clave maestra en vez de la clave de vault, y no
 * es un rodeo: la clave de vault se importa como NO extraíble, así que su material
 * no se puede volver a leer desde fuera de este módulo. Aquí dentro sí, abriendo el
 * envoltorio que ya existe, y así la garantía de que ese material nunca sale sigue
 * intacta.
 *
 * Lanza DecryptionError si la clave maestra no es la que envolvió esto, que es la
 * forma de saber que la contraseña maestra escrita no era la correcta.
 */
export async function wrapVaultKeyForRecovery(
  masterKey: CryptoKey,
  wrapped: Encrypted,
  recoveryWrapKey: CryptoKey,
): Promise<Encrypted> {
  return encryptBytes(recoveryWrapKey, await decryptBytes(masterKey, wrapped))
}

/**
 * Reenvuelve la clave de vault para una clave maestra nueva.
 *
 * Es el simétrico de wrapVaultKeyForRecovery y sirve al final de la recuperación:
 * se abre el envoltorio con la clave de recuperación y se vuelve a cerrar con la
 * clave maestra que el usuario acaba de elegir. Como allí, el material en claro no
 * sale de este módulo.
 */
export async function rewrapForMasterKey(
  recoveryWrapKey: CryptoKey,
  recoveryWrapped: Encrypted,
  masterKey: CryptoKey,
): Promise<Encrypted> {
  return encryptBytes(masterKey, await decryptBytes(recoveryWrapKey, recoveryWrapped))
}

/*
 * ---------------------------------------------------------------------------
 * Export. Ver ADR-011.
 * ---------------------------------------------------------------------------
 */

/**
 * Iteraciones con las que se cifra un fichero de export.
 *
 * Nunca menos que las de la vault, y por un motivo que ADR-011 subraya: un fichero
 * cifrado es un objetivo de fuerza bruta OFFLINE. Quien lo tenga puede atacarlo sin
 * límite de intentos y sin que nadie se entere, que es una situación peor que la del
 * servidor.
 *
 * Este número NO queda fijado en el cliente como el de la vault: viaja dentro del
 * fichero, así que subirlo no deja ilegible ningún export anterior. Es justo el
 * precio que ADR-008 tuvo que aceptar y que aquí no hay por qué pagar.
 */
export const EXPORT_ITERATIONS = 600_000

/** Bytes de salt del export. Aleatorio por fichero, no el correo. */
export const EXPORT_SALT_BYTES = 16

/**
 * Deriva la clave con la que se cifra un fichero de export.
 *
 * El salt llega por parámetro y no se genera aquí porque al importar hay que
 * reproducir la derivación con el que venga en el fichero. Quien exporta lo genera
 * aleatorio; quien importa lo lee.
 */
export async function deriveExportKey(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  return importForEncryption(await deriveBits(toBytes(passphrase), salt, iterations))
}

/** Bytes aleatorios, para el salt del export. */
export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** Base64 de unos bytes, para lo que tenga que viajar en un fichero de texto. */
export function bytesToBase64(bytes: Bytes): string {
  return toBase64(bytes)
}

/** Los bytes de un base64, para leer lo que venía en un fichero. */
export function base64ToBytes(value: string): Bytes {
  return fromBase64(value)
}
