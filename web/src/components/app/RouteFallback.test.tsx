import { Suspense, lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteFallback } from '@/components/app/RouteFallback'

/**
 * In the real application this fallback is hardly ever seen, and for good reasons: on a
 * cold load React suspends before confirming the first render, so what stays in view is
 * the marker index.html carries inside #root; and on navigating, react-router uses a
 * transition and React keeps the previous screen.
 *
 * That is precisely why it has a test. It is a net that is hardly ever deployed, and a
 * net nobody checks is the one that fails the day it is needed — which here would be the
 * blank screen the lazy loading of #45 came to avoid.
 */
describe('the routes fallback', () => {
  it('is painted while the route code has not arrived', () => {
    // A promise that never resolves: the route stays loading forever.
    const NeverArrives = lazy(() => new Promise<never>(() => {}))

    render(
      <Suspense fallback={<RouteFallback />}>
        <NeverArrives />
      </Suspense>,
    )

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
  })

  it('stops being painted as soon as the route arrives', async () => {
    const AlreadyHere = lazy(() => Promise.resolve({ default: () => <p>La pantalla</p> }))

    render(
      <Suspense fallback={<RouteFallback />}>
        <AlreadyHere />
      </Suspense>,
    )

    expect(await screen.findByText('La pantalla')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
  })

  it('fills the whole screen with the application background, so there is no flash', () => {
    // Without `bg-background` the gap is white over a dark theme, which reads as an
    // error and not as a wait.
    const { container } = render(<RouteFallback />)
    const root = container.firstElementChild

    expect(root).toHaveClass('min-h-svh')
    expect(root).toHaveClass('bg-background')
  })
})
