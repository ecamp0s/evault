/**
 * What is seen while a route's code arrives.
 *
 * Since the routes are lazily loaded (#45) there is an instant between navigating and
 * being able to paint. With nothing here that instant is a BLANK SCREEN, which is worse
 * than the large bundle lazy loading came to fix: the user cannot tell «it is slow» from
 * «it is broken».
 *
 * It takes the full height and uses the same background as the real screens, so that the
 * change is not a white flash over the dark theme. It carries no text: in the ordinary
 * case the chunk is already cached and this never gets seen, and a word that appears and
 * disappears in 30 ms is noise. What it does carry is a `role` so that a screen reader
 * knows something is in progress.
 */
export function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="flex min-h-svh items-center justify-center bg-background"
    >
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary"
      />
    </div>
  )
}
