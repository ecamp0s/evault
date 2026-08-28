import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * What is painted when a screen fails instead of appearing.
 *
 * IT EXISTS BECAUSE THERE WAS NOTHING, AND «NOTHING» HERE MEANS THE WHOLE TREE
 * DISAPPEARS. The screens are lazily loaded since #45, so a route is a dynamic
 * `import()`. When one of those rejects, `lazy` throws during render; with no boundary
 * above it React unmounts the entire application, and what the user gets is the last
 * frame frozen: the buttons stop answering and nothing says why. It happened on the
 * real instance the night of 27 August 2026 and the only way out was a reload (#389).
 *
 * AND A DEPLOY IS WHAT CAUSES IT, not a rare accident. `docker/web/Dockerfile` copies a
 * freshly built `dist` over `/srv`, so the previous assets stop existing; their names
 * carry a content hash, so any tab still holding the old `index.html` asks for files
 * that are gone. Every deploy does this to whoever has the application open.
 *
 * `RouteFallback` already covered the chunk that is SLOW, and its comment says why:
 * «the user cannot tell "it is slow" from "it is broken"». This is the other half —
 * the chunk that FAILS — which produced exactly the confusion that sentence set out to
 * prevent.
 */

/**
 * Whether the error is a chunk that could not be fetched.
 *
 * There is no error type to check, so the message is matched. The wordings are
 * Chrome's, Firefox's and Safari's, and they are matched loosely on purpose: a browser
 * rewording its message must not silently turn this back into a blank screen. The
 * fallback branch still offers the reload, it just words it differently.
 */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
    message,
  )
}

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  /**
   * The error is logged and not only shown.
   *
   * When #389 happened on the real instance the console was lost with the reload, so
   * there was nothing left to diagnose with and the cause stayed a hypothesis. Whoever
   * hits this next should find the error waiting for them.
   *
   * It carries no secret: this is a module that would not load, not vault content.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[eVault] La pantalla no se ha podido cargar', error, info.componentStack)
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children

    const chunk = isChunkLoadError(error)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false

    return (
      <div
        role="alert"
        className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center"
      >
        <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />

        <p className="text-sm font-medium">
          {offline
            ? 'Parece que te has quedado sin conexión'
            : chunk
              ? 'Hay una versión nueva de eVault'
              : 'Esta pantalla no se ha podido abrir'}
        </p>

        <p className="max-w-sm text-sm text-muted-foreground">
          {offline
            ? 'No se ha podido cargar esta pantalla. Cuando vuelvas a tener conexión, recarga la página.'
            : chunk
              ? 'Esta pestaña se quedó con la versión anterior y ya no puede cargar el resto de la aplicación. Recarga para seguir.'
              : 'Ha fallado algo al mostrarla. Recargar suele bastar.'}
        </p>

        {/*
          * The warning is not a detail, and it is why this text does not simply say
          * «reload and carry on». Since ADR-007 the session token lives only in memory,
          * so reloading LOCKS THE VAULT: not an expulsion, but it does mean typing the
          * master password again. Someone who reloads without knowing that reads it as
          * having been thrown out, and on a password manager that looks like a fault.
          */}
        <p className="max-w-sm text-sm text-muted-foreground">
          Al recargar, la vault se bloqueará y tendrás que escribir tu contraseña maestra. Lo que
          hayas guardado sigue ahí.
        </p>

        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      </div>
    )
  }
}
