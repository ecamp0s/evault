import { Suspense, lazy } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '@/components/app/RouteErrorBoundary'

/**
 * What is being checked here is not the wording: it is that the tree survives.
 *
 * Before #389 a route whose chunk failed to arrive unmounted the whole application and
 * left the last frame frozen, with no error and no way out other than reloading. These
 * tests fail if that comes back.
 *
 * The console is silenced because React prints the caught error on purpose, and a test
 * suite that shouts on every green run teaches people to ignore it.
 */

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

const CHUNK_MESSAGE = 'Failed to fetch dynamically imported module: /assets/Home-abc123.js'

/*
 * The spies are undone by hand because nothing undoes them for us.
 *
 * There is no `restoreMocks` in the Vitest config, so a `spyOn` survives into the next
 * test. Found the hard way: the offline test left `navigator.onLine` stubbed and the
 * next one failed claiming the notice said the wrong thing, when what was wrong was the
 * previous test. A check can fail for the wrong reason just as easily as it can pass
 * for one.
 */
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('RouteErrorBoundary', () => {
  it('paints what it wraps while nothing fails', () => {
    render(
      <RouteErrorBoundary>
        <p>la vault</p>
      </RouteErrorBoundary>,
    )

    expect(screen.getByText('la vault')).toBeInTheDocument()
  })

  it('survives a route whose chunk never arrives, instead of unmounting the tree', async () => {
    const Never = lazy(() => Promise.reject(new Error(CHUNK_MESSAGE)))

    render(
      <RouteErrorBoundary>
        <Suspense fallback={<p>cargando</p>}>
          <Never />
        </Suspense>
      </RouteErrorBoundary>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('reads a failed chunk as a new version being deployed, which is what causes it', () => {
    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    )

    expect(screen.getByText('Hay una versión nueva de eVault')).toBeInTheDocument()
  })

  it('does not blame a new version when the browser says it is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    )

    expect(screen.getByText('Parece que te has quedado sin conexión')).toBeInTheDocument()
  })

  it('still offers a way out when the error is not a chunk at all', () => {
    render(
      <RouteErrorBoundary>
        <Boom message="cannot read properties of undefined" />
      </RouteErrorBoundary>,
    )

    expect(screen.getByText('Esta pantalla no se ha podido abrir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
  })

  /**
   * ADR-007 is why this sentence is tested and not left to whoever edits the copy.
   *
   * Reloading locks the vault, because the session token lives only in memory. A notice
   * that says «reload» without saying that turns a recovery into what looks like being
   * thrown out of a password manager.
   */
  it('warns that reloading will lock the vault, which ADR-007 makes true', () => {
    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    )

    expect(screen.getByText(/la vault se bloqueará/)).toBeInTheDocument()
  })

  it('reloads the page when asked to', async () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location)

    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('logs the error, because the one that mattered was lost with a reload', () => {
    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    )

    expect(console.error).toHaveBeenCalledWith(
      '[eVault] La pantalla no se ha podido cargar',
      expect.objectContaining({ message: CHUNK_MESSAGE }),
      expect.anything(),
    )
  })
})
