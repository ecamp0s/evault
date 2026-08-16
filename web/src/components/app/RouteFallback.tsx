/**
 * Lo que se ve mientras llega el código de una ruta.
 *
 * Desde que las rutas se cargan de forma diferida (#45) hay un instante entre
 * navegar y poder pintar. Sin nada aquí ese instante es una PANTALLA EN BLANCO,
 * que es peor que el bundle grande que la carga diferida vino a arreglar: el
 * usuario no distingue «tarda» de «se ha roto».
 *
 * Ocupa la altura entera y usa el mismo fondo que las pantallas reales, para que
 * el cambio no sea un fogonazo blanco sobre el tema oscuro. No lleva texto: en el
 * caso normal el chunk ya está en caché y esto no llega a verse, y una palabra
 * que aparece y desaparece en 30 ms es ruido. Lo que sí lleva es un `role` para
 * que un lector de pantalla sepa que hay algo en curso.
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
