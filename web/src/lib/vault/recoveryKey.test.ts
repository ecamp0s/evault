import { describe, expect, it } from 'vitest'
import {
  RECOVERY_ALPHABET,
  RECOVERY_KEY_LENGTH,
  generateRecoveryKey,
  parseRecoveryKey,
} from '@/lib/vault/recoveryKey'
import {
  createVaultKey,
  decrypt,
  deriveKeys,
  deriveRecoveryKeys,
  encrypt,
  openVaultKey,
  wrapVaultKeyForRecovery,
} from '@/lib/vault/crypto'

describe('generar', () => {
  it('produce 256 bits', () => {
    expect(generateRecoveryKey().bytes).toHaveLength(32)
  })

  it('usa solo caracteres del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 50; i++) {
      const withoutDashes = generateRecoveryKey().formatted.replace(/-/g, '')

      expect([...withoutDashes].every((c) => RECOVERY_ALPHABET.includes(c))).toBe(true)
    }
  })

  /*
   * La I, la L y la O son las que se confunden al copiar a mano, que es justo lo
   * que se va a hacer con esto. Si alguien las devolviera al alfabeto, este test lo
   * dice antes de que nadie pierda el acceso a su vault por leer un uno donde había
   * una ele.
   */
  it('nunca contiene caracteres que se confundan entre sí', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryKey().formatted).not.toMatch(/[ILOU]/)
    }
  })

  it('genera una distinta cada vez', () => {
    const views = new Set(Array.from({ length: 100 }, () => generateRecoveryKey().formatted))

    expect(views.size).toBe(100)
  })

  it('se enseña en grupos de cuatro', () => {
    const groups = generateRecoveryKey().formatted.split('-')

    expect(groups.slice(0, -1).every((g) => g.length === 4)).toBe(true)
  })
})

describe('leer lo que el usuario escribe', () => {
  it('recupera los mismos bytes que se generaron', () => {
    const { bytes, formatted } = generateRecoveryKey()
    const parsed = parseRecoveryKey(formatted)

    expect('bytes' in parsed && [...parsed.bytes]).toEqual([...bytes])
  })

  /*
   * Nadie copia respetando el formato. Rechazar por eso sería pelearse con quien
   * está intentando recuperar su cuenta, que es el peor momento para hacerlo.
   */
  it('acepta minúsculas, espacios y guiones de más', () => {
    const { bytes, formatted } = generateRecoveryKey()
    const mangled = `  ${formatted.toLowerCase().replace(/-/g, ' ')}  `

    const parsed = parseRecoveryKey(mangled)

    expect('bytes' in parsed && [...parsed.bytes]).toEqual([...bytes])
  })

  it('avisa si falta o sobra algún carácter', () => {
    const { formatted } = generateRecoveryKey()

    expect(parseRecoveryKey(formatted.slice(0, -1))).toEqual({ problem: 'longitud' })
  })

  it('avisa si hay un carácter que no es del alfabeto', () => {
    const { formatted } = generateRecoveryKey()
    const withBadChar = 'I' + formatted.replace(/-/g, '').slice(1)

    expect(parseRecoveryKey(withBadChar)).toEqual({ problem: 'caracteres' })
  })

  /*
   * EL CASO QUE JUSTIFICA EL CARÁCTER DE COMPROBACIÓN.
   *
   * Sin él, una clave bien escrita salvo por un carácter derivaría una clave
   * distinta y el mensaje sería «no se puede abrir tu vault», que suena a que los
   * datos están perdidos. Con él, el mensaje puede ser «repasa lo que has escrito»,
   * que es lo que de verdad pasa.
   */
  it('detecta un carácter cambiado', () => {
    const { formatted } = generateRecoveryKey()
    const withoutDashes = formatted.replace(/-/g, '')
    const another = RECOVERY_ALPHABET[(RECOVERY_ALPHABET.indexOf(withoutDashes[0]) + 1) % 32]
    const altered = another + withoutDashes.slice(1)

    expect(parseRecoveryKey(altered)).toEqual({ problem: 'comprobacion' })
  })

  /*
   * Intercambiar dos caracteres seguidos también se detecta, y conviene decir por
   * qué, porque la intuición dice lo contrario: una suma no distingue el orden.
   * Aquí sí, porque la suma va sobre los BYTES y no sobre los caracteres, y cada
   * carácter aporta cinco bits que se reparten entre bytes distintos; moverlo de
   * sitio cambia el resultado.
   *
   * No se afirma el 100%: la comprobación es un carácter, así que una de cada
   * treinta y dos alteraciones cuela por casualidad. Lo que cuela lo caza después
   * el envoltorio, que no abre.
   */
  it('detecta también dos caracteres intercambiados', () => {
    let tested = 0
    let detected = 0

    for (let i = 0; i < 60; i++) {
      const withoutDashes = generateRecoveryKey().formatted.replace(/-/g, '')
      const [a, b] = [withoutDashes[0], withoutDashes[1]]

      if (a === b) continue

      tested += 1

      if ('problem' in parseRecoveryKey(b + a + withoutDashes.slice(2))) {
        detected += 1
      }
    }

    expect(tested).toBeGreaterThan(30)
    expect(detected / tested).toBeGreaterThan(0.9)
  })

  it('rechaza una cadena vacía', () => {
    expect(parseRecoveryKey('')).toEqual({ problem: 'longitud' })
  })

  it('tiene la longitud que dice tener', () => {
    expect(generateRecoveryKey().formatted.replace(/-/g, '')).toHaveLength(
      RECOVERY_KEY_LENGTH + 1,
    )
  })
})

describe('derivar', () => {
  /*
   * La propiedad que sostiene ADR-010 §2.2: de la misma clave salen dos valores y
   * uno no permite llegar al otro. Si alguien igualara las etiquetas de dominio,
   * esto lo detecta.
   */
  it('produce una clave de envoltura y un hash distintos entre sí', async () => {
    const { bytes } = generateRecoveryKey()

    const { wrapKey, authHash } = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const encrypted = await encrypt(wrapKey, 'algo')

    expect(authHash).not.toBe(encrypted.data)
    expect(authHash).toHaveLength(44)
  })

  it('deriva lo mismo con la misma clave y el mismo correo', async () => {
    const { bytes } = generateRecoveryKey()

    const first = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const second = await deriveRecoveryKeys(bytes, 'ada@evault.test')

    expect(first.authHash).toBe(second.authHash)
    expect(await decrypt(second.wrapKey, await encrypt(first.wrapKey, 'secreto'))).toBe(
      'secreto',
    )
  })

  it('normaliza el correo igual que el resto del proyecto', async () => {
    const { bytes } = generateRecoveryKey()

    const written = await deriveRecoveryKeys(bytes, '  ADA@Evault.test ')
    const plain = await deriveRecoveryKeys(bytes, 'ada@evault.test')

    expect(written.authHash).toBe(plain.authHash)
  })

  it('deriva distinto para correos distintos', async () => {
    const { bytes } = generateRecoveryKey()

    const ada = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const grace = await deriveRecoveryKeys(bytes, 'grace@evault.test')

    expect(ada.authHash).not.toBe(grace.authHash)
  })
})

/*
 * EL TEST QUE JUSTIFICA TODO LO DEMÁS.
 *
 * Que la clave se genere bonita y se derive de forma determinista no sirve de nada
 * si el envoltorio que produce no abre la vault. Esto recorre el camino entero: se
 * crea una vault con su clave maestra, se envuelve una segunda vez con la clave de
 * recuperación, y después se abre SOLO con la clave de recuperación, sin la
 * contraseña maestra por ningún lado.
 *
 * Es lo que un usuario hará el día que lo necesite, y el día que lo necesite no hay
 * segunda oportunidad.
 */
describe('el camino completo', () => {
  it('la clave de recuperación abre la misma clave de vault', async () => {
    const { masterKey } = await deriveKeys('contraseña-larga', 'ada@evault.test')
    const { vaultKey, wrapped } = await createVaultKey(masterKey)

    // Algo guardado con la clave de vault de siempre.
    const saved = await encrypt(vaultKey, 'la contraseña de GitHub')

    const recovery = generateRecoveryKey()
    const { wrapKey } = await deriveRecoveryKeys(recovery.bytes, 'ada@evault.test')
    const wrappedKey = await wrapVaultKeyForRecovery(masterKey, wrapped, wrapKey)

    // A partir de aquí, solo se usa la clave de recuperación: ni contraseña maestra
    // ni clave maestra, que es la situación real de quien la ha perdido.
    const parsedKey = parseRecoveryKey(recovery.formatted)
    if (!('bytes' in parsedKey)) throw new Error('la clave recién generada no se pudo leer')

    const onlyWithKey = await deriveRecoveryKeys(parsedKey.bytes, 'ada@evault.test')
    const opened = await openVaultKey(onlyWithKey.wrapKey, wrappedKey)

    expect(await decrypt(opened, saved)).toBe('la contraseña de GitHub')
  })

  it('una clave de recuperación distinta no abre nada', async () => {
    const { masterKey } = await deriveKeys('contraseña-larga', 'ada@evault.test')
    const { wrapped } = await createVaultKey(masterKey)

    const good = generateRecoveryKey()
    const other = generateRecoveryKey()

    const wrappedKey = await wrapVaultKeyForRecovery(
      masterKey,
      wrapped,
      (await deriveRecoveryKeys(good.bytes, 'ada@evault.test')).wrapKey,
    )

    const withTheOther = await deriveRecoveryKeys(other.bytes, 'ada@evault.test')

    await expect(openVaultKey(withTheOther.wrapKey, wrappedKey)).rejects.toThrow()
  })
})
