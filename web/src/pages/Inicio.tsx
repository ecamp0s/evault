import { Button } from '@/components/ui/button'
import { useSesion } from '@/lib/sesion'

/**
 * Destino provisional tras autenticarse.
 *
 * Existe porque el issue #5 necesita un sitio al que redirigir y el shell real,
 * con sidebar y rutas protegidas, es el #6. Se sustituye entonces; no merece más
 * cariño del que tiene.
 */
export function Inicio() {
  const usuario = useSesion((estado) => estado.usuario)
  const cerrarSesion = useSesion((estado) => estado.cerrarSesion)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-muted-foreground">Sesión iniciada como</p>
      <p className="text-lg font-medium">{usuario?.email}</p>
      <Button variant="outline" onClick={cerrarSesion}>
        Cerrar sesión
      </Button>
    </main>
  )
}
