import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TotpField } from './TotpField'

/** The seed of RFC 6238, which at T=59 gives a code the test can name. */
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

/**
 * The field on its own, without a form around it.
 *
 * `register` is what the form would pass; here it only has to be an object the input
 * accepts, because what these cases are about is the seed being treated as a secret and
 * the code being shown to compare — not react-hook-form, which has its own tests.
 */
function show(value: string, error?: string) {
  return render(<TotpField value={value} error={error} register={{ name: 'totp' }} />)
}

describe('TotpField', () => {
  it('hides the seed, because it is a password that lasts longer than a password', () => {
    show(SEED)

    expect(screen.getByLabelText('Segundo factor')).toHaveAttribute('type', 'password')
  })

  it('shows it only after asking, and hides it again', async () => {
    const user = userEvent.setup()

    show(SEED)
    await user.click(screen.getByRole('button', { name: 'Mostrar la clave' }))
    expect(screen.getByLabelText('Segundo factor')).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ocultar la clave' }))
    expect(screen.getByLabelText('Segundo factor')).toHaveAttribute('type', 'password')
  })

  /*
   * THE MITIGATION OF THE WORST THING THIS FEATURE CAN DO, and the reason the code is on
   * screen at all: a seed decoded wrong produces six plausible digits that no service
   * accepts, and by then the QR code is gone. Comparing this number against the app
   * still installed turns an irreversible mistake into a typo, so the wording has to
   * survive somebody rewriting this component.
   */
  it('shows the code the seed produces, and says to check it before retiring the other app', async () => {
    show(SEED)

    expect(await screen.findByText(/Ahora mismo saldría/)).toBeInTheDocument()
    expect(screen.getByText(/antes de dejar de usarla/)).toBeInTheDocument()
    expect(await screen.findByText(/^\d{6}$/)).toBeInTheDocument()
  })

  it('shows nothing when there is no seed', () => {
    show('')

    expect(screen.queryByText(/Ahora mismo saldría/)).not.toBeInTheDocument()
  })

  it('shows no code for a seed that cannot be read, instead of a made-up one', async () => {
    show('GEZDGNBV0Y3TQOJQ', '«0» no es un carácter válido en una clave')

    expect(await screen.findByText(/no es un carácter válido/)).toBeInTheDocument()
    expect(screen.queryByText(/Ahora mismo saldría/)).not.toBeInTheDocument()
  })

  /*
   * THE CODE MUST NEVER OUTLIVE THE SEED THAT PRODUCED IT. Generating is asynchronous,
   * so while somebody types the field passes through states that produce no code — and a
   * preview left over from two keystroke ago is six digits that look right and belong to
   * something else, which is the exact failure this whole preview exists to rule out.
   *
   * The case is written with an unreadable seed because it is deterministic: nothing will
   * ever set a code for it, so anything still on screen is stale by construction.
   */
  it('drops the code as soon as the seed stops being the one that produced it', async () => {
    const { rerender } = show(SEED)

    await screen.findByText(/^\d{6}$/)

    rerender(<TotpField value="GEZDGNBV0Y3TQOJQ" register={{ name: 'totp' }} />)

    expect(screen.queryByText(/Ahora mismo saldría/)).not.toBeInTheDocument()
  })

  it('tells where to find the seed, which is the step people get stuck on', () => {
    show('')

    expect(screen.getByText(/no puedo escanearlo/)).toBeInTheDocument()
  })
})
