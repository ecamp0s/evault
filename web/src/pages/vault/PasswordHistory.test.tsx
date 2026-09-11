import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordHistory } from './PasswordHistory'
import { hasUnconfirmed } from '@/lib/vault/history'
import type { ItemContent } from '@/lib/vault/types'

vi.mock('@/lib/vault/copy', () => ({ copySecret: vi.fn(), copyValue: vi.fn() }))

const { copySecret } = await import('@/lib/vault/copy')

const withCandidate: ItemContent = {
  name: 'GitHub',
  password: 'la-actual',
  history: [
    { password: 'de-otro-gestor', date: '2026-02-07T00:00:00.000Z', origin: 'import' },
    { password: 'la-vieja', date: '2026-01-03T00:00:00.000Z', origin: 'rotation' },
  ],
}

function renderHistory(content: ItemContent = withCandidate, blockedBecause?: string) {
  const onChange = vi.fn<(next: ItemContent) => Promise<void>>().mockResolvedValue()

  render(<PasswordHistory content={content} blockedBecause={blockedBecause} onChange={onChange} />)

  return onChange
}

describe('the password history of an entry', () => {
  /*
   * `ADR-018` §5.2: the owner has to know the history exists, said where the password is
   * changed — so it is there even before there is anything in it.
   */
  it('says that changing the password keeps the previous one, even with no history yet', () => {
    renderHistory({ name: 'Nueva', password: 'x' })

    expect(screen.getByText(/la anterior se guarda aquí/i)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  /*
   * Where each one came from goes first, because it decides what the row means — and the
   * date is written with an explicit locale, the lesson of #561.
   */
  it('says where each password came from and when, in Spanish', () => {
    renderHistory()

    expect(screen.getByText('De otro gestor, sin confirmar · entró el 7 de febrero de 2026')).toBeInTheDocument()
    expect(screen.getByText('Retirada el 3 de enero de 2026')).toBeInTheDocument()
  })

  it('does not paint the old passwords until somebody asks', async () => {
    renderHistory()

    expect(screen.queryByText('de-otro-gestor')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver las anteriores' }))

    expect(screen.getByText('de-otro-gestor')).toBeInTheDocument()
    expect(screen.getByText('la-vieja')).toBeInTheDocument()
  })

  it('copies an old password with the helper that clears the clipboard', async () => {
    renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /Copiar la contraseña de otro gestor/i }))

    expect(copySecret).toHaveBeenCalledWith('Contraseña copiada', 'de-otro-gestor')
  })
})

describe('saying which password is the good one', () => {
  it('warns when two managers disagreed and nobody has said which one is current', () => {
    renderHistory()

    expect(screen.getByText(/nadie ha dicho cuál vale/i)).toBeInTheDocument()
  })

  it('says nothing of the sort when every old password was retired', () => {
    renderHistory({ ...withCandidate, history: [withCandidate.history![1]] })

    expect(screen.queryByText(/nadie ha dicho cuál vale/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /La actual es la buena/i })).not.toBeInTheDocument()
  })

  it('confirms the current password and settles the candidates', async () => {
    const onChange = renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /La actual es la buena/i }))

    const next = onChange.mock.calls[0][0]

    expect(next.password).toBe('la-actual')
    expect(hasUnconfirmed(next)).toBe(false)
  })

  it('makes an old password the current one when chosen', async () => {
    const onChange = renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /Esta es la buena: la contraseña de otro gestor/i }))

    expect(onChange.mock.calls[0][0].password).toBe('de-otro-gestor')
  })
})

describe('forgetting', () => {
  /*
   * Deleting one is the destructive gesture, stronger than «this is the good one», so it
   * asks first. Nothing is written by the first click.
   */
  it('asks before forgetting one password, and writes nothing until confirmed', async () => {
    const onChange = renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /Borrar la contraseña retirada/i }))

    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar esta, sin vuelta atrás' }))

    expect(onChange.mock.calls[0][0].history?.map((one) => one.password)).toEqual(['de-otro-gestor'])
  })

  it('lets somebody change their mind about forgetting one', async () => {
    const onChange = renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /Borrar la contraseña retirada/i }))
    await userEvent.click(screen.getByRole('button', { name: 'No borrar' }))

    expect(screen.queryByRole('button', { name: 'Borrar esta, sin vuelta atrás' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('asks before forgetting the whole history', async () => {
    const onChange = renderHistory()

    await userEvent.click(screen.getByRole('button', { name: 'Olvidar el historial' }))

    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Borrarlas todas, sin vuelta atrás' }))

    expect('history' in onChange.mock.calls[0][0]).toBe(false)
  })
})

/*
 * The gestures save at once, so they cannot run underneath a half-edited form: that would
 * leave two versions of the entry on screen and one of them wrong. Copying writes nothing,
 * so it stays available.
 */
describe('while the gestures are blocked', () => {
  it('disables every gesture that writes and says why', () => {
    renderHistory(withCandidate, 'Guarda o descarta los cambios del formulario antes de tocar el historial.')

    expect(screen.getByText(/Guarda o descarta los cambios/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /La actual es la buena/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Esta es la buena: la contraseña de otro gestor/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Borrar la contraseña retirada/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Olvidar el historial' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Copiar la contraseña de otro gestor/i })).toBeEnabled()
  })
})
