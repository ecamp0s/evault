import { expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

/*
 * That the tests' own setup does what it says. See #232.
 *
 * These two tests go IN THIS ORDER and are read together: the first leaves a notice
 * hanging and the second checks that it did not arrive. Separating or reordering them
 * leaves them meaningless, and that is why they are in a file of their own instead of
 * loose among others.
 *
 * What they watch over is a leak that does not show while writing a test: sonner's
 * notices live in the module's global state, outside React's tree, so `cleanup()` does
 * not erase them. Without the setup's `toast.dismiss()`, a test inherits the notices of
 * the previous ones and fails —or does not— depending on the execution order.
 */

it('leaves a notice hanging on purpose', async () => {
  render(<Toaster />)
  toast.success('Un aviso que no debería sobrevivir a este test')

  await waitFor(() =>
    expect(screen.getAllByText(/no debería sobrevivir/)).toHaveLength(1),
  )
})

it('and the next test does not inherit it', async () => {
  render(<Toaster />)

  /*
   * A moment is waited on purpose: if the old notice were going to reappear, it would
   * do so on mounting this Toaster, not instantly. Checking without waiting would give
   * a green that means nothing.
   */
  await new Promise((resolve) => setTimeout(resolve, 50))

  expect(screen.queryAllByText(/no debería sobrevivir/)).toHaveLength(0)
})
