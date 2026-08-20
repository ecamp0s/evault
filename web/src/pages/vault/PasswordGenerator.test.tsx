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

/** Opens the panel, which on the first click also generates a password. */
async function open(onGenerate = vi.fn()) {
  renderPage(onGenerate)

  await userEvent.click(screen.getByRole('button', { name: /generar una contraseña/i }))

  return { onGenerate }
}

beforeEach(() => {
  localStorage.clear()
  useGeneratorPreferences.setState({ ...DEFAULT_OPTIONS })
})

describe('the entry point', () => {
  it('starts folded, so as not to crowd the form', () => {
    renderPage()

    expect(screen.getByRole('button', { name: /generar una contraseña/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Longitud')).not.toBeInTheDocument()
  })

  /*
   * Opening the panel already generates a password. Whoever presses «generar» wants a
   * password, not a panel of options: asking them for a second click for what they have
   * just asked for is redundant.
   */
  it('on opening it hands over a password without asking for another click', async () => {
    const { onGenerate } = await open()

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0]?.[0]).toHaveLength(DEFAULT_OPTIONS.length)
  })

  it('generates a different one when asked', async () => {
    const { onGenerate } = await open()

    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    expect(onGenerate).toHaveBeenCalledTimes(2)
    expect(onGenerate.mock.calls[0]?.[0]).not.toBe(onGenerate.mock.calls[1]?.[0])
  })
})

describe('the options', () => {
  /*
   * fireEvent.change and not userEvent: a range input cannot be typed into, and
   * assigning the value by hand does not reach React, which listens with its own event
   * system over the element's native setter.
   */
  it('the chosen length is the length of the password it hands over', async () => {
    const { onGenerate } = await open()

    fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '32' } })

    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    expect(onGenerate.mock.calls.at(-1)?.[0]).toHaveLength(32)
  })

  /*
   * The control is native precisely so that the keyboard does not have to be
   * reimplemented: a range input already responds to the arrow keys, and doing it by
   * hand would have been repeating work the browser does better.
   *
   * What is checked here is what jsdom can check — that the control is reachable, is
   * labelled and declares its limits — and not the increment with the arrows: jsdom does
   * not implement that behaviour of the range, so a test attempting it would measure
   * jsdom and not the application. It is the same lesson the accessible name of the
   * buttons left in Iteration 2. The arrows were verified in a browser.
   */
  it('the length control is reachable and declares its limits', async () => {
    await open()

    const lengthControl = screen.getByLabelText('Longitud') as HTMLInputElement

    lengthControl.focus()

    expect(lengthControl).toHaveFocus()
    expect(lengthControl.type).toBe('range')
    expect(lengthControl.min).toBe(String(MIN_LENGTH))
    expect(lengthControl.max).toBe(String(MAX_LENGTH))
  })

  it('removing the symbols removes them from the password', async () => {
    const { onGenerate } = await open()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Símbolos' }))
    await userEvent.click(screen.getByRole('button', { name: /generar otra/i }))

    const generated = onGenerate.mock.calls.at(-1)?.[0] as string

    for (const symbol of ALPHABETS.symbols) {
      expect(generated).not.toContain(symbol)
    }
  })

  /*
   * With no class active nothing can be generated, so the last ticked one cannot be
   * unticked. The alternative — allowing it and showing an error — would punish the user
   * for a state the interface should never let them reach.
   */
  it('does not allow ending up with no character class at all', async () => {
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
 * The preferences are persisted, unlike the token and the key: there is no secret here,
 * only how long a password is and which characters it carries.
 */
describe('the preferences', () => {
  it('survive closing and reopening the panel', async () => {
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

  it('store no password at all', async () => {
    const { onGenerate } = await open()

    const generated = onGenerate.mock.calls[0]?.[0] as string

    expect(JSON.stringify(localStorage)).not.toContain(generated)
  })
})
