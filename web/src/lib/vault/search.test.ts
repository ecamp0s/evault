import { describe, expect, it } from 'vitest'
import { filterItems, normalize } from './search'
import type { ItemContent, Item } from './types'

function item(id: string, content: ItemContent): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

const GITHUB = item('1', {
  nombre: 'GitHub',
  usuario: 'ada@example.com',
  url: 'https://github.com',
  notas: 'la del trabajo',
})

const BANK = item('2', {
  nombre: 'Banco Español',
  usuario: '0001',
  url: 'https://banco.es',
  password: 'secretísima',
})

const EMAIL = item('3', { nombre: 'Correo del año', usuario: 'ada@correo.com' })

const ALL = [GITHUB, BANK, EMAIL]

/** Los nombres de lo que ha encontrado, que se lee mejor que los objetos enteros. */
function names(items: Item[]): string[] {
  return items.map(({ content }) => content.nombre)
}

describe('normalize', () => {
  it('ignora las mayúsculas', () => {
    expect(normalize('GitHub')).toBe('github')
  })

  it('ignora los acentos', () => {
    expect(normalize('café')).toBe('cafe')
    expect(normalize('Ítaca')).toBe('itaca')
  })

  /*
   * La ñ también pierde la tilde, y es una decisión de producto y no un descuido.
   * En español es una letra propia, así que al ordenar habría que conservarla; en
   * una búsqueda no, porque quien escribe «espanol» con un teclado sin ñ espera
   * encontrar «Español», y no encontrarlo parece que la entrada no existe.
   *
   * El precio es que «ano» encuentre «año»: un resultado de más, que se descarta de
   * un vistazo. En una búsqueda, un falso positivo molesta y un falso negativo
   * esconde.
   */
  it('también quita la tilde de la ñ, para que «espanol» encuentre «Español»', () => {
    expect(normalize('Español')).toBe('espanol')
    expect(normalize('año')).toBe('ano')
  })
})

describe('filterItems', () => {
  it('sin texto devuelve todo', () => {
    expect(filterItems(ALL, '')).toHaveLength(3)
    expect(filterItems(ALL, '   ')).toHaveLength(3)
  })

  it('encuentra por nombre', () => {
    expect(names(filterItems(ALL, 'github'))).toEqual(['GitHub'])
  })

  it('encuentra por usuario', () => {
    expect(names(filterItems(ALL, '0001'))).toEqual(['Banco Español'])
  })

  it('encuentra por url', () => {
    expect(names(filterItems(ALL, 'banco.es'))).toEqual(['Banco Español'])
  })

  it('encuentra por notas, que es donde se distingue una cuenta de otra', () => {
    expect(names(filterItems(ALL, 'trabajo'))).toEqual(['GitHub'])
  })

  it('no distingue mayúsculas ni acentos', () => {
    expect(names(filterItems(ALL, 'ESPANOL'))).toEqual(['Banco Español'])
    expect(names(filterItems(ALL, 'español'))).toEqual(['Banco Español'])
  })

  /*
   * Todas las palabras tienen que aparecer, en cualquier campo. Quien escribe
   * «github ada» busca la entrada de GitHub de Ada, no todas las que contengan una
   * cosa u otra: con la unión, una búsqueda de dos palabras devolvería más
   * resultados que una de una, que es lo contrario de lo que espera cualquiera.
   */
  it('exige todas las palabras y no cualquiera de ellas', () => {
    expect(names(filterItems(ALL, 'github ada'))).toEqual(['GitHub'])
    expect(filterItems(ALL, 'github banco')).toHaveLength(0)
  })

  it('las palabras pueden estar en campos distintos y en cualquier orden', () => {
    expect(names(filterItems(ALL, 'ada github'))).toEqual(['GitHub'])
    expect(names(filterItems(ALL, 'trabajo example'))).toEqual(['GitHub'])
  })

  it('devuelve lista vacía si no hay coincidencias', () => {
    expect(filterItems(ALL, 'no existe nada así')).toEqual([])
  })

  /*
   * La contraseña no es un campo buscable, y no por descuido: buscar por ella
   * obligaría a teclear un secreto en un campo visible en claro que además queda en
   * el historial del formulario del navegador.
   */
  it('nunca busca dentro de la contraseña', () => {
    expect(filterItems(ALL, 'secretísima')).toEqual([])
  })

  it('tolera items a los que les faltan campos', () => {
    expect(names(filterItems([EMAIL], 'correo'))).toEqual(['Correo del año'])
  })

  it('conserva el orden en el que venían', () => {
    expect(names(filterItems(ALL, 'ada'))).toEqual(['GitHub', 'Correo del año'])
  })
})
