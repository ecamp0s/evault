import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ALPHABETS, DEFAULT_OPTIONS, MAX_LENGTH, MIN_LENGTH } from '@/lib/vault/passwordGenerator'
import { useGeneratorPreferences } from '@/lib/vault/generatorPreferences'
import { PasswordGenerator } from './PasswordGenerator'

function renderPage(onGenerate = vi.fn()) {
  render(<PasswordGenerator onGenerate={onGenerate} />)

  return { onGenerate }
}

/** Abre el panel, que en el primer clic genera además una contraseña. */
async function open(onGenerate = vi.fn()) {
  renderPage(onGenerate)

  await userEvent.click(screen.getByRole('button', { name: /generar una contraseña/i }))

  return { onGenerate }
}

beforeEach(() => {
  localStorage.clear()
  useGeneratorPreferences.setState({ ...DEFAULT_OPTIONS })
})

describe('el punto de entrada', () => {
  it('empieza recogido, para no llenar el formulario', () => {
    renderPage()

    expect(screen.getByRole('button', { name: /generar una contraseña/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Longitud')).not.toBeInTheDocument()
  })

  /*
   * Abrir el panel genera ya una contraseña. Quien pulsa «generar» quiere una
   * contraseña, no un panel de opciones: pedirle un segundo clic para lo que acaba
   * de pedir sobra.
   */
  it('al abrirlo entrega una contraseña sin pedir otro clic', async () => {
    const { onGenerate } = await open()

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0]?.[0]).toHaveLength(DEFAULT_OPTIONS.length)
  })

  it('genera otra distinta al pedirlo', async () => {
    const { onGenerate } = await open()

    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    expect(onGenerate).toHaveBeenCalledTimes(2)
    expect(onGenerate.mock.calls[0]?.[0]).not.toBe(onGenerate.mock.calls[1]?.[0])
  })
})

describe('las opciones', () => {
  /*
   * fireEvent.change y no userEvent: en un input de rango no se puede escribir, y
   * asignar el valor a mano no llega a React, que escucha con su propio sistema de
   * eventos sobre el setter nativo del elemento.
   */
  it('la longitud elegida es la de la contraseña que entrega', async () => {
    const { onGenerate } = await open()

    fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '32' } })

    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    expect(onGenerate.mock.calls.at(-1)?.[0]).toHaveLength(32)
  })

  /*
   * El control es nativo precisamente para no tener que reimplementar el teclado:
   * un input de rango ya responde a las flechas, y hacerlo a mano habría sido
   * repetir trabajo que el navegador hace mejor.
   *
   * Lo que se comprueba aquí es lo que jsdom puede comprobar —que el control es
   * alcanzable, está etiquetado y declara sus límites—, no el incremento con las
   * flechas: jsdom no implementa ese comportamiento del rango, así que un test que
   * lo intentara mediría jsdom y no la aplicación. Es la misma lección que dejó el
   * nombre accesible de los botones en la Iteración 2. Con las flechas se verificó
   * en navegador.
   */
  it('el control de longitud es alcanzable y declara sus límites', async () => {
    await open()

    const lengthControl = screen.getByLabelText('Longitud') as HTMLInputElement

    lengthControl.focus()

    expect(lengthControl).toHaveFocus()
    expect(lengthControl.type).toBe('range')
    expect(lengthControl.min).toBe(String(MIN_LENGTH))
    expect(lengthControl.max).toBe(String(MAX_LENGTH))
  })

  it('quitar los símbolos los quita de la contraseña', async () => {
    const { onGenerate } = await open()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Símbolos' }))
    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    const generated = onGenerate.mock.calls.at(-1)?.[0] as string

    for (const symbol of ALPHABETS.symbols) {
      expect(generated).not.toContain(symbol)
    }
  })

  /*
   * Sin ninguna clase activa no se puede generar nada, así que la última marcada no
   * se deja desmarcar. La alternativa —permitirlo y enseñar un error— sería
   * castigar al usuario por un estado al que la interfaz no debería dejarle llegar.
   */
  it('no deja quedarse sin ningún tipo de carácter', async () => {
    await open()

    for (const label of ['Minúsculas', 'Mayúsculas', 'Números', 'Símbolos']) {
      await userEvent.click(screen.getByRole('checkbox', { name: label }))
    }

    const checkedOnes = screen
      .getAllByRole('checkbox')
      .filter((checkbox) => (checkbox as HTMLInputElement).checked)

    expect(checkedOnes).toHaveLength(1)
  })
})

/*
 * Las preferencias sí se persisten, al contrario que el token y la clave: aquí no
 * hay ningún secreto, solo cuánto mide una contraseña y qué caracteres lleva.
 */
describe('las preferencias', () => {
  it('sobreviven a cerrar y volver a abrir el panel', async () => {
    const { unmount } = render(<PasswordGenerator onGenerate={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /generar una contraseña/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Símbolos' }))

    unmount()

    const onGenerate = vi.fn()
    render(<PasswordGenerator onGenerate={onGenerate} />)
    await userEvent.click(screen.getByRole('button', { name: /generar una contraseña/i }))

    expect((screen.getByRole('checkbox', { name: 'Símbolos' }) as HTMLInputElement).checked).toBe(
      false,
    )
  })

  it('no guardan ninguna contraseña', async () => {
    const { onGenerate } = await open()

    const generated = onGenerate.mock.calls[0]?.[0] as string

    expect(JSON.stringify(localStorage)).not.toContain(generated)
  })
})
