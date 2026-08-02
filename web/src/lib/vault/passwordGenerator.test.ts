import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALPHABETS,
  DEFAULT_OPTIONS,
  InvalidPasswordOptions,
  type PasswordOptions,
  generatePassword,
} from './passwordGenerator'

/*
 * Los dos fallos que este módulo puede tener no se ven mirando una contraseña
 * generada: usar una fuente aleatoria débil, y sesgar la selección de caracteres.
 * Una contraseña sesgada parece perfectamente aleatoria a simple vista y tiene
 * menos entropía de la que aparenta, así que estos tests son la única forma de
 * saber que no ocurre.
 */

function conClases(...activas: (keyof typeof ALPHABETS)[]): PasswordOptions {
  return {
    length: 20,
    classes: {
      lowercase: activas.includes('lowercase'),
      uppercase: activas.includes('uppercase'),
      digits: activas.includes('digits'),
      symbols: activas.includes('symbols'),
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('la fuente de aleatoriedad', () => {
  /*
   * Math.random no es criptográficamente seguro: su estado se puede reconstruir
   * observando unas cuantas salidas, y con él, predecir las siguientes. En un
   * generador de contraseñas eso no es un matiz académico.
   */
  it('es crypto.getRandomValues y no Math.random', () => {
    const cripto = vi.spyOn(crypto, 'getRandomValues')
    const matematica = vi.spyOn(Math, 'random')

    generatePassword(DEFAULT_OPTIONS)

    expect(cripto).toHaveBeenCalled()
    expect(matematica).not.toHaveBeenCalled()
  })
})

describe('la selección de caracteres no tiene sesgo', () => {
  /*
   * El test que de verdad detecta el sesgo de módulo, y es determinista en vez de
   * estadístico. Una primera versión medía la distribución sobre una muestra
   * grande y NO detectaba el fallo: con un alfabeto de 25 caracteres el sesgo es
   * de en torno al 10%, y cualquier margen lo bastante ancho para no fallar por
   * azar lo deja pasar.
   *
   * Así que en vez de medir la salida se controla la entrada. El alfabeto de
   * minúsculas tiene 25 caracteres, así que el mayor múltiplo de 25 que cabe en un
   * byte es 250: los valores 250 a 255 caen en el tramo incompleto y hay que
   * descartarlos. Una implementación correcta vuelve a tirar; una con `byte % 25`
   * devuelve 250 % 25 = 0, es decir, la primera letra del alfabeto.
   */
  it('descarta los valores que producirían sesgo en vez de aplicarles el módulo', () => {
    const secuencia = [250, 251, 7]
    let llamada = 0

    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((buffer: Uint8Array) => {
      buffer[0] = secuencia[llamada] ?? 7
      llamada += 1

      return buffer
    }) as typeof crypto.getRandomValues)

    const generada = generatePassword({
      length: 1,
      classes: { lowercase: true, uppercase: false, digits: false, symbols: false },
    })

    // Con sesgo saldría la 'a', que es ALPHABETS.lowercase[250 % 25] = [0].
    expect(generada).toBe(ALPHABETS.lowercase[7])
    expect(generada).not.toBe(ALPHABETS.lowercase[0])
    expect(llamada).toBe(3)
  })

  it('usa todo el alfabeto y no solo su principio', () => {
    const alfabeto = ALPHABETS.lowercase
    const generadas = Array.from({ length: 200 }, () =>
      generatePassword({ length: 25, classes: { ...conClases('lowercase').classes } }),
    ).join('')

    for (const letra of alfabeto) {
      expect(generadas).toContain(letra)
    }
  })

  /*
   * Los caracteres que garantizan cada clase se añaden en orden, así que sin
   * barajar TODA contraseña empezaría por una minúscula, seguiría por una
   * mayúscula, y así. Es estructura predecible que reduce el trabajo de un
   * atacante.
   *
   * Se mira la CLASE del primer carácter y no el carácter: una primera versión
   * contaba caracteres distintos y no detectaba el fallo, porque sin barajar el
   * primero sigue siendo una minúscula cualquiera de veinticinco posibles.
   */
  it('no deja siempre la misma clase en la primera posición', () => {
    const clasesIniciales = new Set(
      Array.from({ length: 80 }, () => {
        const primero = generatePassword(DEFAULT_OPTIONS)[0] ?? ''

        return (Object.keys(ALPHABETS) as (keyof typeof ALPHABETS)[]).find((clase) =>
          ALPHABETS[clase].includes(primero),
        )
      }),
    )

    expect(clasesIniciales.size).toBeGreaterThan(1)
  })

  it('tampoco deja siempre la misma clase en la segunda', () => {
    const segundas = new Set(
      Array.from({ length: 80 }, () => {
        const segundo = generatePassword(DEFAULT_OPTIONS)[1] ?? ''

        return (Object.keys(ALPHABETS) as (keyof typeof ALPHABETS)[]).find((clase) =>
          ALPHABETS[clase].includes(segundo),
        )
      }),
    )

    expect(segundas.size).toBeGreaterThan(1)
  })
})

describe('lo que promete cada opción', () => {
  it('la longitud pedida es la longitud obtenida', () => {
    for (const length of [8, 12, 20, 33, 64]) {
      expect(generatePassword({ ...DEFAULT_OPTIONS, length })).toHaveLength(length)
    }
  })

  /*
   * Si se marca una casilla, esa clase aparece siempre y no «casi siempre». Con
   * veinte caracteres el azar la incluiría casi seguro, pero eso no es lo que
   * promete una casilla marcada, y con longitudes cortas deja de ser cierto.
   */
  it.each([
    ['lowercase' as const],
    ['uppercase' as const],
    ['digits' as const],
    ['symbols' as const],
  ])('si se pide %s, aparece siempre, incluso en contraseñas cortas', (clase) => {
    for (let intento = 0; intento < 40; intento += 1) {
      const generada = generatePassword({ ...conClases(clase, 'lowercase'), length: 8 })

      expect([...generada].some((caracter) => ALPHABETS[clase].includes(caracter))).toBe(true)
    }
  })

  it('no usa caracteres de una clase que no se ha pedido', () => {
    for (let intento = 0; intento < 40; intento += 1) {
      const generada = generatePassword(conClases('lowercase', 'digits'))

      expect(generada).toMatch(/^[abcdefghijkmnopqrstuvwxyz23456789]+$/)
    }
  })

  /*
   * Fuera l, I, 1, O y 0: son las confusiones clásicas al leer una contraseña de
   * una pantalla para teclearla en otro dispositivo.
   */
  it('nunca produce caracteres ambiguos', () => {
    const generadas = Array.from({ length: 100 }, () => generatePassword(DEFAULT_OPTIONS)).join('')

    for (const ambiguo of ['l', 'I', '1', 'O', '0']) {
      expect(generadas).not.toContain(ambiguo)
    }
  })

  it('dos contraseñas seguidas no coinciden', () => {
    const generadas = new Set(Array.from({ length: 50 }, () => generatePassword(DEFAULT_OPTIONS)))

    expect(generadas.size).toBe(50)
  })
})

describe('opciones que no pueden producir una contraseña', () => {
  it('sin ninguna clase activa, falla en vez de devolver algo vacío', () => {
    expect(() =>
      generatePassword({ length: 20, classes: { lowercase: false, uppercase: false, digits: false, symbols: false } }),
    ).toThrow(InvalidPasswordOptions)
  })

  /*
   * Cuatro clases no caben en tres caracteres. Fallar es mejor que devolver una
   * contraseña que incumple en silencio lo que las casillas prometen.
   */
  it('si la longitud no da para todas las clases pedidas, falla', () => {
    expect(() => generatePassword({ ...DEFAULT_OPTIONS, length: 3 })).toThrow(
      InvalidPasswordOptions,
    )
  })
})
