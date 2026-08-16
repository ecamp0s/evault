import { Suspense, lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteFallback } from '@/components/app/RouteFallback'

/**
 * En la aplicación real este fallback casi nunca se ve, y por buenos motivos: en
 * la carga en frío React suspende antes de confirmar el primer render, así que
 * queda a la vista el marcador que index.html trae dentro de #root; y al navegar,
 * react-router usa una transición y React conserva la pantalla anterior.
 *
 * Justamente por eso tiene test. Es una red que no se despliega casi nunca, y una
 * red que nadie comprueba es la que falla el día que hace falta — que aquí sería
 * la pantalla en blanco que la carga diferida de #45 vino a evitar.
 */
describe('el fallback de las rutas', () => {
  it('se pinta mientras el código de la ruta no ha llegado', () => {
    // Una promesa que no se resuelve: la ruta se queda cargando para siempre.
    const NeverArrives = lazy(() => new Promise<never>(() => {}))

    render(
      <Suspense fallback={<RouteFallback />}>
        <NeverArrives />
      </Suspense>,
    )

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
  })

  it('deja de pintarse en cuanto la ruta llega', async () => {
    const AlreadyHere = lazy(() => Promise.resolve({ default: () => <p>La pantalla</p> }))

    render(
      <Suspense fallback={<RouteFallback />}>
        <AlreadyHere />
      </Suspense>,
    )

    expect(await screen.findByText('La pantalla')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
  })

  it('ocupa la pantalla entera y con el fondo de la aplicación, para que no haya un fogonazo', () => {
    // Sin `bg-background` el hueco es blanco sobre un tema oscuro, que se lee como
    // un error y no como una espera.
    const { container } = render(<RouteFallback />)
    const root = container.firstElementChild

    expect(root).toHaveClass('min-h-svh')
    expect(root).toHaveClass('bg-background')
  })
})
